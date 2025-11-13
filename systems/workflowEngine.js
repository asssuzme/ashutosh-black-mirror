/**
 * Workflow Automation Engine
 * Handles if-then logic, action chains, automated follow-ups
 */

const postgres = require('../database/postgres');
const memory = require('../utils/memoryManager');

// App and admin references (set during initialization)
let slackApp = null;
let adminUserId = null;

/**
 * Initialize workflow engine with Slack app
 */
function initialize(app, adminId) {
  slackApp = app;
  adminUserId = adminId;
  console.log('✅ Workflow Engine initialized');
}

// Workflow definitions
const WORKFLOWS = {
  // Task assignment workflow
  task_assigned: {
    trigger: 'task_assigned',
    chain: [
      { action: 'wait', duration: 2 * 60 * 60 * 1000 }, // 2 hours
      { action: 'check_progress', condition: 'no_update' },
      { action: 'send_reminder', template: 'task_reminder' },
      { action: 'wait', duration: 2 * 60 * 60 * 1000 }, // Another 2 hours
      { action: 'check_progress', condition: 'no_update' },
      { action: 'escalate_to_admin', message: 'No progress on task after 4 hours' }
    ]
  },

  // Check-in workflow
  morning_check_in: {
    trigger: 'time',
    schedule: '0 10 * * *', // 10 AM daily
    chain: [
      { action: 'check_attendance', allInterns: true },
      { action: 'wait', duration: 30 * 60 * 1000 }, // 30 minutes
      { action: 'send_reminder', condition: 'not_checked_in', template: 'check_in_reminder' },
      { action: 'wait', duration: 30 * 60 * 1000 }, // Another 30 minutes
      { action: 'notify_admin', condition: 'still_not_checked_in' }
    ]
  },

  // Task completion workflow
  task_completed: {
    trigger: 'task_completed_claim',
    chain: [
      { action: 'request_screenshot' },
      { action: 'wait', duration: 10 * 60 * 1000 }, // 10 minutes
      { action: 'check_screenshot', condition: 'not_uploaded' },
      { action: 'send_reminder', template: 'screenshot_reminder' },
      { action: 'wait', duration: 10 * 60 * 1000 },
      { action: 'mark_incomplete', condition: 'no_screenshot', notify: true }
    ]
  },

  // End of day workflow
  end_of_day: {
    trigger: 'time',
    schedule: '0 18 * * *', // 6 PM daily
    chain: [
      { action: 'generate_summary', allInterns: true },
      { action: 'check_pending_tasks' },
      { action: 'send_to_admin', template: 'daily_summary' }
    ]
  },

  // Stuck detection workflow
  user_stuck: {
    trigger: 'negative_sentiment',
    chain: [
      { action: 'offer_help' },
      { action: 'wait', duration: 30 * 60 * 1000 },
      { action: 'check_resolution', condition: 'still_stuck' },
      { action: 'notify_admin', message: 'User still stuck after 30 minutes' }
    ]
  },

  // Meeting reschedule workflow (needs admin approval)
  meeting_reschedule_request: {
    trigger: 'reschedule_request',
    chain: [
      { action: 'request_admin_approval', template: 'reschedule_approval' },
      { action: 'wait_for_approval', timeout: 30 * 60 * 1000 },
      { action: 'execute_if_approved', successAction: 'send_to_channel' },
      { action: 'notify_requester', template: 'reschedule_result' }
    ]
  }
};

// Active workflow instances
const activeWorkflows = new Map();

/**
 * Start a workflow
 */
async function startWorkflow(workflowName, context) {
  const workflow = WORKFLOWS[workflowName];

  if (!workflow) {
    console.error(`Unknown workflow: ${workflowName}`);
    return;
  }

  const instanceId = `${workflowName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const instance = {
    id: instanceId,
    workflow: workflowName,
    context,
    currentStep: 0,
    status: 'running',
    startedAt: new Date(),
    history: []
  };

  activeWorkflows.set(instanceId, instance);

  console.log(`🔄 Started workflow: ${workflowName} (${instanceId})`);

  // Execute first step
  await executeNextStep(instanceId);

  return instanceId;
}

/**
 * Execute next step in workflow
 */
async function executeNextStep(instanceId) {
  const instance = activeWorkflows.get(instanceId);

  if (!instance || instance.status !== 'running') {
    return;
  }

  const workflow = WORKFLOWS[instance.workflow];
  const step = workflow.chain[instance.currentStep];

  if (!step) {
    // Workflow complete
    instance.status = 'completed';
    instance.completedAt = new Date();
    console.log(`✅ Workflow completed: ${instance.workflow} (${instanceId})`);
    return;
  }

  console.log(`⚡ Executing step ${instance.currentStep + 1}/${workflow.chain.length}: ${step.action}`);

  instance.history.push({
    step: instance.currentStep,
    action: step.action,
    timestamp: new Date()
  });

  try {
    // Execute the action
    const shouldContinue = await executeAction(step, instance);

    if (shouldContinue) {
      instance.currentStep++;

      // If this was a wait, schedule next step
      if (step.action === 'wait') {
        setTimeout(() => executeNextStep(instanceId), step.duration);
      } else {
        // Execute next step immediately
        await executeNextStep(instanceId);
      }
    } else {
      // Condition not met, skip to next step
      instance.currentStep++;
      await executeNextStep(instanceId);
    }
  } catch (error) {
    console.error(`Error executing workflow step:`, error);
    instance.status = 'error';
    instance.error = error.message;
  }
}

/**
 * Execute a workflow action
 */
async function executeAction(step, instance) {
  const { action, condition, template, message, duration } = step;
  const { context } = instance;

  switch (action) {
    case 'wait':
      console.log(`⏳ Waiting ${duration / 1000 / 60} minutes...`);
      return true;

    case 'check_progress':
      if (condition === 'no_update') {
        // Check if user has sent any updates since task assignment
        const hasUpdate = await checkForUpdates(context.userId, context.taskId, context.since);
        return !hasUpdate; // Continue only if no update
      }
      return false;

    case 'send_reminder':
      await sendReminder(context.userId, template, context);
      return true;

    case 'escalate_to_admin':
      await escalateToAdmin(message || 'Workflow escalation', context);
      return true;

    case 'check_attendance':
      if (step.allInterns) {
        return await checkAllAttendance();
      }
      return await checkUserAttendance(context.userId);

    case 'request_screenshot':
      await requestScreenshot(context.userId, context.taskId);
      return true;

    case 'check_screenshot':
      const hasScreenshot = await checkScreenshotUploaded(context.taskId);
      return condition === 'not_uploaded' ? !hasScreenshot : hasScreenshot;

    case 'mark_incomplete':
      if (condition === 'no_screenshot') {
        await markTaskIncomplete(context.taskId, 'No screenshot provided');
      }
      return true;

    case 'generate_summary':
      const summary = await generateDailySummary(step.allInterns);
      context.summary = summary;
      return true;

    case 'check_pending_tasks':
      const pending = await checkPendingTasks();
      context.pendingTasks = pending;
      return true;

    case 'send_to_admin':
      await sendToAdmin(template, context);
      return true;

    case 'offer_help':
      await offerHelp(context.userId);
      return true;

    case 'check_resolution':
      const resolved = await checkIfResolved(context.userId, context.since);
      return condition === 'still_stuck' ? !resolved : resolved;

    case 'notify_admin':
      await notifyAdmin(message, context);
      return true;

    case 'request_admin_approval':
      const approvalId = await requestAdminApproval(template, context);
      context.approvalId = approvalId;
      return true;

    case 'wait_for_approval':
      // This will be handled by approval system
      return await waitForApproval(context.approvalId, step.timeout);

    case 'execute_if_approved':
      if (context.approved) {
        await executeApprovedAction(step.successAction, context);
      }
      return true;

    case 'notify_requester':
      await notifyRequester(context.userId, template, context);
      return true;

    default:
      console.log(`Unknown action: ${action}`);
      return false;
  }
}

/**
 * Check for updates from user
 */
async function checkForUpdates(userId, taskId, since) {
  const conversations = await postgres.getUserConversationHistory(userId, 10);
  const recentUpdates = conversations.filter(c =>
    new Date(c.timestamp) > since &&
    (c.intent === 'task_update' || c.message.toLowerCase().includes('progress'))
  );
  return recentUpdates.length > 0;
}

/**
 * Send reminder to user
 */
async function sendReminder(userId, template, context) {
  const messages = {
    task_reminder: `Hey! Just checking in on the task "${context.taskTitle}". How's it going? Any blockers?`,
    check_in_reminder: `Good morning! Don't forget to check in for the day. Just say "here" or "present" and you're good to go!`,
    screenshot_reminder: `Could you please upload a screenshot of your completed work for "${context.taskTitle}"? This helps us verify completion.`
  };

  const intern = await memory.getIntern(userId);
  if (intern) {
    const { sendDM } = require('../utils/slackHelper');
    const { App } = require('@slack/bolt');
    // TODO: Get app instance
    console.log(`📨 Sending reminder to ${intern.name}: ${messages[template]}`);
  }
}

/**
 * Escalate to admin
 */
async function escalateToAdmin(message, context) {
  console.log(`🚨 Escalating to admin: ${message}`, context);
  // TODO: Implement admin notification
}

/**
 * Check all intern attendance
 */
async function checkAllAttendance() {
  const interns = await postgres.getAllActiveInterns();
  const today = new Date().toISOString().split('T')[0];

  for (const intern of interns) {
    const attendance = await postgres.getAttendanceForDate(intern.id, today);
    if (!attendance) {
      console.log(`⚠️ ${intern.name} hasn't checked in yet`);
    }
  }

  return true;
}

/**
 * Check user attendance
 */
async function checkUserAttendance(userId) {
  const intern = await postgres.getInternBySlackId(userId);
  if (!intern) return false;

  const today = new Date().toISOString().split('T')[0];
  const attendance = await postgres.getAttendanceForDate(intern.id, today);

  return !!attendance;
}

/**
 * Request screenshot from user
 */
async function requestScreenshot(userId, taskId) {
  console.log(`📸 Requesting screenshot from user ${userId} for task ${taskId}`);
  // TODO: Send message to user
}

/**
 * Check if screenshot was uploaded
 */
async function checkScreenshotUploaded(taskId) {
  // TODO: Check if task has screenshot
  return false;
}

/**
 * Mark task as incomplete
 */
async function markTaskIncomplete(taskId, reason) {
  console.log(`❌ Marking task ${taskId} as incomplete: ${reason}`);
  // TODO: Update task status
}

/**
 * Generate daily summary
 */
async function generateDailySummary(allInterns) {
  const interns = await postgres.getAllActiveInterns();
  const today = new Date().toISOString().split('T')[0];

  const summary = {
    date: today,
    totalInterns: interns.length,
    checkedIn: 0,
    tasksCompleted: 0,
    issues: []
  };

  for (const intern of interns) {
    const attendance = await postgres.getAttendanceForDate(intern.id, today);
    if (attendance) summary.checkedIn++;

    // TODO: Get today's completed tasks
  }

  return summary;
}

/**
 * Check pending tasks
 */
async function checkPendingTasks() {
  // TODO: Query all pending tasks
  return [];
}

/**
 * Send to admin
 */
async function sendToAdmin(template, context) {
  console.log(`📧 Sending to admin (${template}):`, context);
  // TODO: Format and send to admin
}

/**
 * Offer help to user
 */
async function offerHelp(userId) {
  console.log(`🤝 Offering help to user ${userId}`);
  // TODO: Send help offer message
}

/**
 * Check if issue was resolved
 */
async function checkIfResolved(userId, since) {
  const conversations = await postgres.getUserConversationHistory(userId, 5);
  const recentMessages = conversations.filter(c => new Date(c.timestamp) > since);

  // Check for positive sentiment
  const resolved = recentMessages.some(c =>
    c.message.toLowerCase().includes('thanks') ||
    c.message.toLowerCase().includes('got it') ||
    c.message.toLowerCase().includes('fixed')
  );

  return resolved;
}

/**
 * Notify admin
 */
async function notifyAdmin(message, context) {
  console.log(`🔔 Notifying admin: ${message}`, context);
  // TODO: Send notification to admin
}

/**
 * Request admin approval
 */
async function requestAdminApproval(template, context) {
  const approvalId = `approval_${Date.now()}`;

  console.log(`✋ Requesting admin approval (${approvalId}):`, context);

  // Store in approval queue
  const approvalQueue = require('./approvalQueue');
  await approvalQueue.addApproval({
    id: approvalId,
    type: template,
    context,
    status: 'pending'
  });

  return approvalId;
}

/**
 * Wait for approval
 */
async function waitForApproval(approvalId, timeout) {
  const approvalQueue = require('./approvalQueue');
  const approval = await approvalQueue.waitForApproval(approvalId, timeout);

  return approval && approval.status === 'approved';
}

/**
 * Execute approved action
 */
async function executeApprovedAction(action, context) {
  console.log(`✅ Executing approved action: ${action}`, context);
  // TODO: Execute the approved action
}

/**
 * Notify requester of result
 */
async function notifyRequester(userId, template, context) {
  const result = context.approved ? 'approved' : 'denied';
  console.log(`📬 Notifying ${userId}: Request ${result}`);
  // TODO: Send notification
}

/**
 * Cancel a workflow
 */
function cancelWorkflow(instanceId) {
  const instance = activeWorkflows.get(instanceId);
  if (instance) {
    instance.status = 'cancelled';
    console.log(`🛑 Workflow cancelled: ${instanceId}`);
  }
}

/**
 * Get active workflows
 */
function getActiveWorkflows() {
  return Array.from(activeWorkflows.values());
}

module.exports = {
  initialize,
  startWorkflow,
  cancelWorkflow,
  getActiveWorkflows,
  WORKFLOWS
};
