/**
 * Approval Queue System
 * Manages requests that need admin approval before execution
 */

const postgres = require('../database/postgres');

// In-memory approval queue (can be moved to database later)
const approvalQueue = new Map();
const approvalCallbacks = new Map();

// App and admin references (set during initialization)
let slackApp = null;
let adminUserId = null;

/**
 * Initialize approval queue with Slack app
 */
function initialize(app, adminId) {
  slackApp = app;
  adminUserId = adminId;
  console.log('✅ Approval Queue initialized');
}

/**
 * Add item to approval queue
 */
async function addApproval(approval) {
  approval.createdAt = new Date();
  approval.status = 'pending';

  approvalQueue.set(approval.id, approval);

  console.log(`📋 Added to approval queue: ${approval.id} (${approval.type})`);

  // Send to admin for approval
  await sendApprovalRequestToAdmin(approval);

  return approval.id;
}

/**
 * Send approval request to admin via DM
 */
async function sendApprovalRequestToAdmin(approval) {
  const { type, context } = approval;

  let message = '🔔 **Approval Required**\n\n';

  switch (type) {
    case 'task_assignment':
      message += `**Task Assignment Request**\n`;
      message += `• Intern: ${context.internName}\n`;
      message += `• Task: ${context.taskTitle}\n`;
      message += `• Priority: ${context.priority}\n`;
      message += `• Estimated Time: ${context.estimatedTime} mins\n\n`;
      message += `Reason: ${context.reason || 'Regular task assignment'}\n\n`;
      break;

    case 'reschedule_approval':
      message += `**Meeting Reschedule Request**\n`;
      message += `• Requested by: ${context.requesterName}\n`;
      message += `• Original time: ${context.originalTime}\n`;
      message += `• New time: ${context.newTime}\n`;
      message += `• Reason: ${context.reason || 'Not specified'}\n\n`;
      break;

    case 'escalation':
      message += `**Issue Escalation**\n`;
      message += `• Intern: ${context.internName}\n`;
      message += `• Issue: ${context.issue}\n`;
      message += `• Severity: ${context.severity}\n`;
      message += `• Duration: ${context.duration}\n\n`;
      break;

    default:
      message += `**${type}**\n`;
      message += JSON.stringify(context, null, 2);
  }

  message += `\nReply with:\n`;
  message += `• \`approve ${approval.id}\` to approve\n`;
  message += `• \`reject ${approval.id}\` to reject\n`;
  message += `• \`approve ${approval.id} [message]\` to approve with custom message`;

  console.log(`📨 Sending approval request to admin:\n${message}`);

  // Send to admin DM
  if (slackApp && adminUserId) {
    try {
      await slackApp.client.chat.postMessage({
        channel: adminUserId,
        text: message
      });
    } catch (error) {
      console.error('Error sending approval request to admin:', error);
    }
  }
}

/**
 * Approve an item
 */
async function approve(approvalId, approvedBy, customMessage = null) {
  const approval = approvalQueue.get(approvalId);

  if (!approval) {
    return { success: false, error: 'Approval not found' };
  }

  if (approval.status !== 'pending') {
    return { success: false, error: `Approval already ${approval.status}` };
  }

  approval.status = 'approved';
  approval.approvedBy = approvedBy;
  approval.approvedAt = new Date();
  approval.customMessage = customMessage;

  console.log(`✅ Approved: ${approvalId} by ${approvedBy}`);

  // Notify waiting workflows
  const callback = approvalCallbacks.get(approvalId);
  if (callback) {
    callback(approval);
    approvalCallbacks.delete(approvalId);
  }

  // Store in database for audit
  await storeApprovalRecord(approval);

  return { success: true, approval };
}

/**
 * Reject an item
 */
async function reject(approvalId, rejectedBy, reason = null) {
  const approval = approvalQueue.get(approvalId);

  if (!approval) {
    return { success: false, error: 'Approval not found' };
  }

  if (approval.status !== 'pending') {
    return { success: false, error: `Approval already ${approval.status}` };
  }

  approval.status = 'rejected';
  approval.rejectedBy = rejectedBy;
  approval.rejectedAt = new Date();
  approval.rejectionReason = reason;

  console.log(`❌ Rejected: ${approvalId} by ${rejectedBy} - ${reason || 'No reason given'}`);

  // Notify waiting workflows
  const callback = approvalCallbacks.get(approvalId);
  if (callback) {
    callback(approval);
    approvalCallbacks.delete(approvalId);
  }

  // Store in database for audit
  await storeApprovalRecord(approval);

  return { success: true, approval };
}

/**
 * Wait for approval (used by workflows)
 */
function waitForApproval(approvalId, timeout = 30 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const approval = approvalQueue.get(approvalId);

    if (!approval) {
      reject(new Error('Approval not found'));
      return;
    }

    // If already decided, return immediately
    if (approval.status !== 'pending') {
      resolve(approval);
      return;
    }

    // Set up callback for when decision is made
    approvalCallbacks.set(approvalId, resolve);

    // Set timeout
    setTimeout(() => {
      if (approvalCallbacks.has(approvalId)) {
        approvalCallbacks.delete(approvalId);

        // Auto-reject on timeout
        approval.status = 'timeout';
        approval.timeoutAt = new Date();

        console.log(`⏱️ Approval timeout: ${approvalId}`);

        resolve(approval);
      }
    }, timeout);
  });
}

/**
 * Get pending approvals for admin
 */
function getPendingApprovals() {
  return Array.from(approvalQueue.values())
    .filter(a => a.status === 'pending')
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Get approval history
 */
function getApprovalHistory(limit = 50) {
  return Array.from(approvalQueue.values())
    .filter(a => a.status !== 'pending')
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

/**
 * Store approval record in database for audit
 */
async function storeApprovalRecord(approval) {
  try {
    // Store in learning_insights table or create approvals table
    const query = `
      INSERT INTO learning_insights (
        insight_type, title, description, confidence_score,
        supporting_data, applied, applied_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    await postgres.query(query, [
      'approval_record',
      `${approval.type} - ${approval.status}`,
      JSON.stringify(approval.context),
      approval.status === 'approved' ? 1.0 : 0.0,
      JSON.stringify({
        approvalId: approval.id,
        type: approval.type,
        status: approval.status,
        approvedBy: approval.approvedBy,
        rejectedBy: approval.rejectedBy,
        reason: approval.rejectionReason,
        customMessage: approval.customMessage
      }),
      approval.status === 'approved',
      approval.approvedAt || approval.rejectedAt
    ]);
  } catch (error) {
    console.error('Error storing approval record:', error);
  }
}

/**
 * Learn from approval patterns
 */
async function analyzeApprovalPatterns() {
  const history = getApprovalHistory(100);

  const patterns = {
    approvalRate: {},
    commonReasons: {},
    timePatterns: {}
  };

  // Group by type
  history.forEach(approval => {
    if (!patterns.approvalRate[approval.type]) {
      patterns.approvalRate[approval.type] = { approved: 0, rejected: 0, total: 0 };
    }

    patterns.approvalRate[approval.type].total++;

    if (approval.status === 'approved') {
      patterns.approvalRate[approval.type].approved++;
    } else if (approval.status === 'rejected') {
      patterns.approvalRate[approval.type].rejected++;

      // Track rejection reasons
      if (approval.rejectionReason) {
        if (!patterns.commonReasons[approval.type]) {
          patterns.commonReasons[approval.type] = {};
        }
        patterns.commonReasons[approval.type][approval.rejectionReason] =
          (patterns.commonReasons[approval.type][approval.rejectionReason] || 0) + 1;
      }
    }
  });

  // Calculate approval rates
  Object.keys(patterns.approvalRate).forEach(type => {
    const data = patterns.approvalRate[type];
    data.rate = data.total > 0 ? (data.approved / data.total) * 100 : 0;
  });

  return patterns;
}

/**
 * Auto-approve based on learned patterns (with high confidence)
 */
async function considerAutoApproval(approval) {
  const patterns = await analyzeApprovalPatterns();

  const typeRate = patterns.approvalRate[approval.type];

  // Auto-approve if this type is ALWAYS approved
  if (typeRate && typeRate.rate === 100 && typeRate.total >= 10) {
    console.log(`🤖 Auto-approving ${approval.id} based on 100% approval history`);
    return true;
  }

  // Check for specific patterns
  if (approval.type === 'task_assignment' && approval.context.priority === 'low') {
    // Auto-approve low priority tasks if 90%+ approval rate
    if (typeRate && typeRate.rate >= 90 && typeRate.total >= 5) {
      console.log(`🤖 Auto-approving low priority task based on ${typeRate.rate}% approval rate`);
      return true;
    }
  }

  return false;
}

module.exports = {
  initialize,
  addApproval,
  approve,
  reject,
  waitForApproval,
  getPendingApprovals,
  getApprovalHistory,
  analyzeApprovalPatterns,
  considerAutoApproval
};
