/**
 * Proactive Management System
 * Initiates actions without waiting for messages
 * Monitors, alerts, follows up, and manages autonomously
 */

const cron = require('node-cron');
const postgres = require('../database/postgres');
const memory = require('../utils/memoryManager');
const learningEngine = require('./learningEngine');
const workflowEngine = require('./workflowEngine');
const approvalQueue = require('./approvalQueue');

/**
 * Initialize all proactive management tasks
 */
function initialize(app, adminUserId) {
  console.log('🚀 Initializing Proactive Management System...');

  // Morning check-in monitoring (10 AM IST)
  cron.schedule('0 10 * * *', () => morningCheckInMonitor(app, adminUserId), {
    timezone: 'Asia/Kolkata'
  });

  // Mid-morning check (10:30 AM IST) - remind those who haven't checked in
  cron.schedule('30 10 * * *', () => checkInReminderRound(app, adminUserId), {
    timezone: 'Asia/Kolkata'
  });

  // Late morning alert (11 AM IST) - escalate persistent absences
  cron.schedule('0 11 * * *', () => lateCheckInEscalation(app, adminUserId), {
    timezone: 'Asia/Kolkata'
  });

  // Midday task check (1 PM IST) - check if people need tasks
  cron.schedule('0 13 * * *', () => middayTaskCheck(app, adminUserId), {
    timezone: 'Asia/Kolkata'
  });

  // Afternoon progress check (3 PM IST) - how are tasks going
  cron.schedule('0 15 * * *', () => afternoonProgressCheck(app, adminUserId), {
    timezone: 'Asia/Kolkata'
  });

  // End of day validation (6 PM IST) - summary and wrap-up
  cron.schedule('0 18 * * *', () => endOfDayValidation(app, adminUserId), {
    timezone: 'Asia/Kolkata'
  });

  // Evening summary for admin (10 PM IST) - full day report
  cron.schedule('0 22 * * *', () => eveningSummary(app, adminUserId), {
    timezone: 'Asia/Kolkata'
  });

  // Continuous monitoring (every 15 minutes during work hours)
  cron.schedule('*/15 9-18 * * *', () => continuousMonitoring(app, adminUserId), {
    timezone: 'Asia/Kolkata'
  });

  // Weekly insights (Sunday 8 PM IST)
  cron.schedule('0 20 * * 0', () => weeklyInsights(app, adminUserId), {
    timezone: 'Asia/Kolkata'
  });

  console.log('✅ Proactive Management System initialized');
}

/**
 * Morning check-in monitoring
 */
async function morningCheckInMonitor(app, adminUserId) {
  console.log('🌅 Morning check-in monitor running...');

  const interns = await postgres.getAllActiveInterns();
  const today = new Date().toISOString().split('T')[0];

  for (const intern of interns) {
    const attendance = await postgres.getAttendanceForDate(intern.id, today);

    if (!attendance) {
      console.log(`⏰ ${intern.name} hasn't checked in yet - starting workflow`);

      // Start check-in reminder workflow
      await workflowEngine.startWorkflow('morning_check_in', {
        userId: intern.slack_id,
        internId: intern.id,
        internName: intern.name
      });
    }
  }
}

/**
 * Check-in reminder round (30 minutes after start)
 */
async function checkInReminderRound(app, adminUserId) {
  console.log('🔔 Check-in reminder round...');

  const interns = await postgres.getAllActiveInterns();
  const today = new Date().toISOString().split('T')[0];

  const notCheckedIn = [];

  for (const intern of interns) {
    const attendance = await postgres.getAttendanceForDate(intern.id, today);

    if (!attendance) {
      notCheckedIn.push(intern);

      // Send friendly reminder
      await app.client.chat.postMessage({
        channel: intern.channel_id,
        text: `Good morning ${intern.name}! 👋 Just a friendly reminder to check in for the day. Just say "here" or "present" whenever you're ready!`
      });
    }
  }

  if (notCheckedIn.length > 0) {
    console.log(`⚠️ ${notCheckedIn.length} interns haven't checked in: ${notCheckedIn.map(i => i.name).join(', ')}`);
  }
}

/**
 * Late check-in escalation (1 hour after start)
 */
async function lateCheckInEscalation(app, adminUserId) {
  console.log('🚨 Late check-in escalation...');

  const interns = await postgres.getAllActiveInterns();
  const today = new Date().toISOString().split('T')[0];

  const stillAbsent = [];

  for (const intern of interns) {
    const attendance = await postgres.getAttendanceForDate(intern.id, today);

    if (!attendance) {
      stillAbsent.push(intern);
    }
  }

  if (stillAbsent.length > 0) {
    // Notify admin
    const message = `🚨 **Attendance Alert**\n\nThe following team members haven't checked in yet (it's 11 AM):\n\n${
      stillAbsent.map(i => `• ${i.name} (${i.role})`).join('\n')
    }\n\nShould I send them a direct message or would you like to handle this?`;

    await app.client.chat.postMessage({
      channel: adminUserId,
      text: message
    });
  }
}

/**
 * Midday task check - proactively assign tasks
 */
async function middayTaskCheck(app, adminUserId) {
  console.log('📋 Midday task check...');

  const interns = await postgres.getAllActiveInterns();

  for (const intern of interns) {
    // Get current tasks
    const tasks = await postgres.getInternTasks(intern.id, false);
    const pendingTasks = tasks.filter(t => !t.completed);

    // Analyze patterns to predict if they need tasks
    const patterns = await learningEngine.analyzeUserPatterns(intern.slack_id);

    if (pendingTasks.length === 0 || (patterns && patterns.likelyToNeedTasks)) {
      console.log(`📝 ${intern.name} might need tasks - requesting admin approval`);

      // Request admin approval for task assignment
      const approvalId = await approvalQueue.addApproval({
        id: `task_assign_${intern.id}_${Date.now()}`,
        type: 'task_assignment',
        context: {
          internId: intern.id,
          internName: intern.name,
          internRole: intern.role,
          currentTaskCount: pendingTasks.length,
          reason: pendingTasks.length === 0
            ? 'No pending tasks'
            : 'Pattern analysis suggests user will need tasks soon',
          predictedBy: 'learning_engine'
        }
      });

      console.log(`✋ Waiting for admin approval (${approvalId})...`);
    }
  }
}

/**
 * Afternoon progress check
 */
async function afternoonProgressCheck(app, adminUserId) {
  console.log('📊 Afternoon progress check...');

  const interns = await postgres.getAllActiveInterns();

  for (const intern of interns) {
    const tasks = await postgres.getInternTasks(intern.id, false);
    const pending = tasks.filter(t => !t.completed);

    // Check tasks assigned more than 4 hours ago with no progress
    const stuckTasks = pending.filter(task => {
      const hoursSince = (Date.now() - new Date(task.assigned_at)) / (1000 * 60 * 60);
      return hoursSince > 4;
    });

    if (stuckTasks.length > 0) {
      console.log(`⚠️ ${intern.name} has ${stuckTasks.length} tasks with no progress for 4+ hours`);

      // Check recent conversations for signs of being stuck
      const recentConvos = await postgres.getUserConversationHistory(intern.slack_id, 5);
      const seemsStuck = recentConvos.some(c =>
        c.message.toLowerCase().includes('stuck') ||
        c.message.toLowerCase().includes('problem') ||
        c.message.toLowerCase().includes('issue')
      );

      if (seemsStuck) {
        // Escalate to admin
        await app.client.chat.postMessage({
          channel: adminUserId,
          text: `🚧 **Potential Issue**\n\n${intern.name} seems stuck on tasks:\n${
            stuckTasks.map(t => `• ${t.title} (${Math.floor((Date.now() - new Date(t.assigned_at)) / (1000 * 60 * 60))}h old)`).join('\n')
          }\n\nRecent messages suggest they're having trouble. Should I check in with them?`
        });
      } else {
        // Just send a gentle check-in
        await app.client.chat.postMessage({
          channel: intern.channel_id,
          text: `Hey ${intern.name}! How's it going with your current tasks? Need any help or have questions? I'm here if you need anything! 💪`
        });
      }
    }
  }
}

/**
 * End of day validation
 */
async function endOfDayValidation(app, adminUserId) {
  console.log('🌆 End of day validation...');

  const interns = await postgres.getAllActiveInterns();
  const today = new Date().toISOString().split('T')[0];

  for (const intern of interns) {
    const attendance = await postgres.getAttendanceForDate(intern.id, today);
    const tasks = await postgres.getInternTasks(intern.id, false);

    // Calculate today's completions
    const completedToday = tasks.filter(t => {
      if (!t.completed_at) return false;
      const completedDate = new Date(t.completed_at).toISOString().split('T')[0];
      return completedDate === today;
    });

    let message = `📊 **End of Day Summary for ${intern.name}**\n\n`;

    if (attendance) {
      const loginTime = new Date(attendance.login_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      message += `✅ Checked in: ${loginTime}${attendance.is_late ? ' (late)' : ''}\n`;
    } else {
      message += `❌ No check-in recorded\n`;
    }

    message += `\n📋 Tasks:\n`;
    message += `• Completed today: ${completedToday.length}\n`;
    message += `• Still pending: ${tasks.filter(t => !t.completed).length}\n`;

    if (completedToday.length > 0) {
      message += `\n**Completed:**\n${completedToday.map(t => `• ${t.title}`).join('\n')}`;
    }

    const pendingTasks = tasks.filter(t => !t.completed);
    if (pendingTasks.length > 0) {
      message += `\n\n**Pending:**\n${pendingTasks.slice(0, 3).map(t => `• ${t.title}`).join('\n')}`;
      if (pendingTasks.length > 3) {
        message += `\n• ... and ${pendingTasks.length - 3} more`;
      }
    }

    message += `\n\nGreat work today! 🎉 See you tomorrow!`;

    await app.client.chat.postMessage({
      channel: intern.channel_id,
      text: message
    });
  }
}

/**
 * Evening summary for admin
 */
async function eveningSummary(app, adminUserId) {
  console.log('📈 Generating evening summary for admin...');

  const interns = await postgres.getAllActiveInterns();
  const today = new Date().toISOString().split('T')[0];

  let summary = `📊 **Daily Team Summary - ${new Date().toLocaleDateString('en-IN')}**\n\n`;

  let totalCheckedIn = 0;
  let totalTasksCompleted = 0;
  let issues = [];

  for (const intern of interns) {
    const attendance = await postgres.getAttendanceForDate(intern.id, today);
    if (attendance) totalCheckedIn++;

    const tasks = await postgres.getInternTasks(intern.id, true);
    const completedToday = tasks.filter(t => {
      if (!t.completed_at) return false;
      const completedDate = new Date(t.completed_at).toISOString().split('T')[0];
      return completedDate === today;
    });

    totalTasksCompleted += completedToday.length;

    // Track issues
    if (!attendance) {
      issues.push(`${intern.name} - No check-in`);
    } else if (attendance.is_late) {
      issues.push(`${intern.name} - Late by ${attendance.late_by_minutes} mins`);
    }

    if (completedToday.length === 0 && attendance) {
      issues.push(`${intern.name} - No tasks completed`);
    }
  }

  summary += `**Team Stats:**\n`;
  summary += `• Team size: ${interns.length}\n`;
  summary += `• Checked in: ${totalCheckedIn}/${interns.length}\n`;
  summary += `• Total tasks completed: ${totalTasksCompleted}\n`;
  summary += `• Average per person: ${(totalTasksCompleted / interns.length).toFixed(1)}\n\n`;

  if (issues.length > 0) {
    summary += `**Issues/Notes:**\n${issues.map(i => `• ${i}`).join('\n')}\n\n`;
  } else {
    summary += `✅ **All good! No issues today.**\n\n`;
  }

  // Add learning insights
  const insights = await learningEngine.generateTeamInsights(interns);

  if (insights.predictions.length > 0) {
    summary += `**Predictions for Tomorrow:**\n`;
    insights.predictions.forEach(p => {
      summary += `• ${p.user}: ${p.prediction.replace('_', ' ')} (${(p.confidence * 100).toFixed(0)}% confidence)\n`;
    });
    summary += `\n`;
  }

  if (insights.recommendations.length > 0) {
    summary += `**Recommendations:**\n`;
    insights.recommendations.slice(0, 3).forEach(r => {
      summary += `• ${r.user}: ${r.recommendation}\n`;
    });
  }

  await app.client.chat.postMessage({
    channel: adminUserId,
    text: summary
  });
}

/**
 * Continuous monitoring (every 15 minutes during work hours)
 */
async function continuousMonitoring(app, adminUserId) {
  // Silent monitoring - check for issues

  const interns = await postgres.getAllActiveInterns();

  for (const intern of interns) {
    // Check recent messages for negative sentiment
    const recentConvos = await postgres.getUserConversationHistory(intern.slack_id, 3);

    if (recentConvos.length > 0) {
      const latestMessage = recentConvos[recentConvos.length - 1];
      const text = latestMessage.message.toLowerCase();

      // Detect frustration/being stuck
      if (
        text.includes('stuck') ||
        text.includes('not working') ||
        text.includes('error') ||
        text.includes('problem') ||
        text.includes('help')
      ) {
        const timeSince = Date.now() - new Date(latestMessage.timestamp);
        const minutesSince = timeSince / (1000 * 60);

        // If stuck for more than 20 minutes, offer help
        if (minutesSince > 20) {
          console.log(`🆘 ${intern.name} seems stuck for ${minutesSince.toFixed(0)} minutes`);

          await app.client.chat.postMessage({
            channel: intern.channel_id,
            text: `Hey ${intern.name}, I noticed you might be stuck on something. Would you like me to:\n\n1️⃣ Get help from the boss\n2️⃣ Assign you a different task\n3️⃣ Find someone on the team who can help\n\nJust let me know!`
          });

          // Start stuck workflow
          await workflowEngine.startWorkflow('user_stuck', {
            userId: intern.slack_id,
            internName: intern.name,
            since: latestMessage.timestamp
          });
        }
      }
    }
  }
}

/**
 * Weekly insights (Sunday evening)
 */
async function weeklyInsights(app, adminUserId) {
  console.log('📅 Generating weekly insights...');

  const interns = await postgres.getAllActiveInterns();

  let report = `📊 **Weekly Team Report**\n${new Date().toLocaleDateString('en-IN')}\n\n`;

  // Get last 7 days of data for each intern
  for (const intern of interns) {
    const patterns = await learningEngine.analyzeUserPatterns(intern.slack_id);

    if (!patterns) continue;

    report += `**${intern.name}** (${intern.role})\n`;
    report += `• Task completion rate: ${patterns.taskCompletionRate.toFixed(0)}%\n`;

    if (patterns.punctuality) {
      report += `• Punctuality: ${patterns.punctuality.latePercentage.toFixed(0)}% late\n`;
    }

    report += `• Engagement: ${patterns.engagementLevel}\n`;
    report += `• Mood: ${patterns.currentMood}\n`;

    if (patterns.preferredTaskTypes.length > 0) {
      report += `• Good at: ${patterns.preferredTaskTypes.slice(0, 2).join(', ')}\n`;
    }

    report += `\n`;
  }

  // Add team-wide insights
  const insights = await learningEngine.generateTeamInsights(interns);

  if (insights.alerts.length > 0) {
    report += `**Alerts:**\n`;
    insights.alerts.forEach(alert => {
      report += `• [${alert.severity}] ${alert.message}\n`;
    });
    report += `\n`;
  }

  report += `---\n\nReady for the new week! 🚀`;

  await app.client.chat.postMessage({
    channel: adminUserId,
    text: report
  });
}

module.exports = {
  initialize
};
