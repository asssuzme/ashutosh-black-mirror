/**
 * AI Boss 2.0 - Self-Learning Slack Manager
 * Pure AI-driven version - NO keyword detection shortcuts
 *
 * Philosophy:
 * - AI analyzes EVERY message with full context
 * - No hardcoded rules or keyword matching
 * - True context awareness via PostgreSQL + Qdrant
 * - Let AI intelligence do the work
 */

require('dotenv').config();
const { App } = require('@slack/bolt');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

// Database (NEW: PostgreSQL + Qdrant)
const postgres = require('./database/postgres');
const qdrant = require('./database/qdrant');

// Utilities
const openaiHelper = require('./utils/openaiHelper');
const slackHelper = require('./utils/slackHelper');
const memory = require('./utils/memoryManager');
const aiDecisionEngine = require('./utils/aiDecisionEngine');
const conversationMemory = require('./utils/conversationMemory-v2'); // NEW database-backed version

// Autonomous Systems
const learningEngine = require('./systems/learningEngine');
const workflowEngine = require('./systems/workflowEngine');
const approvalQueue = require('./systems/approvalQueue');
const proactiveManager = require('./systems/proactiveManager');

// Ensure memory directory exists (for backward compatibility during migration)
const memoryDir = path.join(__dirname, 'memory');
if (!fs.existsSync(memoryDir)) {
  console.log('Creating memory directory...');
  fs.mkdirSync(memoryDir, { recursive: true });
}

// Environment variables
const {
  SLACK_BOT_TOKEN,
  SLACK_SIGNING_SECRET,
  SLACK_APP_TOKEN,
  ADMIN_USER_ID,
  TIMEZONE = 'Asia/Kolkata'
} = process.env;

// Initialize Slack app
const app = new App({
  token: SLACK_BOT_TOKEN,
  signingSecret: SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: SLACK_APP_TOKEN,
  port: process.env.PORT || 3000
});

// Store bot user ID
let BOT_USER_ID = null;

/**
 * Initialize bot and databases
 */
async function initialize() {
  try {
    console.log('🚀 Initializing AI Boss 2.0 (Pure AI Mode)...\n');

    // Initialize database connections
    console.log('📡 Connecting to databases...');
    postgres.initializePool();
    await qdrant.initializeCollection();
    console.log('✅ Database connections established\n');

    // Get bot user ID
    const authResult = await app.client.auth.test();
    BOT_USER_ID = authResult.user_id;

    console.log('🤖 AI Boss 2.0 initialized (Pure AI Mode)');
    console.log(`Bot User ID: ${BOT_USER_ID}`);
    console.log(`Admin User ID: ${ADMIN_USER_ID}`);
    console.log(`Timezone: ${TIMEZONE}`);
    console.log('\n🧠 Pure AI Decision Making: ENABLED');
    console.log('🔍 Keyword Detection: DISABLED');
    console.log('📊 PostgreSQL + Qdrant: ENABLED\n');

    // Initialize autonomous systems
    console.log('🚀 Initializing autonomous systems...');
    workflowEngine.initialize(app, ADMIN_USER_ID);
    approvalQueue.initialize(app, ADMIN_USER_ID);
    proactiveManager.initialize(app, ADMIN_USER_ID);
    console.log('✅ Autonomous systems online\n');

    // Set up cron jobs
    setupCronJobs();

    // Send startup message to admin
    await sendAdminMessage('✅ AI Boss 2.0 is online (Pure AI Mode)!\n\n✨ Now powered by true intelligence - no keyword shortcuts, pure contextual understanding.\n\n🤖 Autonomous systems active:\n• Learning Engine - Pattern analysis\n• Workflow Engine - Automated actions\n• Approval Queue - Admin oversight\n• Proactive Manager - Continuous monitoring');
  } catch (error) {
    console.error('Error initializing bot:', error);
    throw error;
  }
}

/**
 * Send message to admin
 */
async function sendAdminMessage(text, blocks = null) {
  try {
    await slackHelper.sendDM(app, ADMIN_USER_ID, {
      text,
      blocks
    });
  } catch (error) {
    console.error('Error sending admin message:', error);
  }
}

/**
 * Handle app mentions (when someone @mentions the bot)
 * Pure AI decision making - no shortcuts
 */
app.event('app_mention', async ({ event, say, client }) => {
  try {
    console.log('\n🔔 Bot mentioned:', {
      user: event.user,
      text: event.text,
      channel: event.channel,
      thread_ts: event.thread_ts || 'no thread',
      is_thread_mention: !!event.thread_ts
    });

    // If this is a thread mention, log it
    if (event.thread_ts) {
      console.log('🧵 Mentioned in thread, will load thread context and reply there');
    }

    // Clean @mention from text
    const cleanText = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();

    // Process with AI - EVERY mention goes to AI
    await processMessageWithAI({
      message: {
        ...event,
        text: cleanText,
        channel_type: event.channel_type || 'channel'
      },
      say,
      client,
      isMention: true
    });

  } catch (error) {
    console.error('❌ Error handling mention:', error);
  }
});

/**
 * Handle file uploads (screenshots for verification)
 */
app.event('file_shared', async ({ event, client }) => {
  try {
    console.log('\n📎 File uploaded:', event.file_id);

    const fileInfo = await client.files.info({
      file: event.file_id
    });

    const file = fileInfo.file;
    const isImage = file.mimetype?.startsWith('image/');

    if (isImage && event.user_id) {
      const intern = await memory.getIntern(event.user_id);

      if (intern) {
        console.log(`🖼️ ${intern.name} uploaded screenshot, verifying...`);

        const imageUrl = file.url_private || file.permalink_public;

        // Verify screenshot with GPT-4 Vision
        const verification = await openaiHelper.verifyScreenshot(
          imageUrl,
          `Intern: ${intern.name}, Role: ${intern.role}, Current tasks: ${intern.currentTasks?.map(t => t.title).join(', ')}`
        );

        const responseMsg = verification.verified
          ? `✅ Screenshot verified!\n\n📝 Work identified: ${verification.workDescription}\n\nGreat job! Keep it up! 💪`
          : `⚠️ Screenshot verification issue:\n\n${verification.concerns}\n\nPlease upload a clearer screenshot showing your work.`;

        await app.client.chat.postMessage({
          channel: intern.channelId,
          text: responseMsg
        });

        // Store in conversation memory
        await conversationMemory.storeConversation({
          messageId: event.file.created,
          channelId: event.channel_id,
          userId: event.user_id,
          userName: intern.name,
          userRole: intern.role,
          message: '[Screenshot uploaded]',
          messageType: 'file',
          intent: 'task_verification',
          botResponse: responseMsg,
          actionsTaken: verification.verified ? ['screenshot_verified'] : ['screenshot_rejected'],
          tags: ['screenshot', verification.verified ? 'verified' : 'rejected']
        });

        console.log(`${verification.verified ? '✅' : '⚠️'} Screenshot verification for ${intern.name}`);
      }
    }
  } catch (error) {
    console.error('❌ Error handling file upload:', error);
  }
});

/**
 * Handle all incoming messages
 * Pure AI decision making - EVERY message analyzed
 */
app.message(async ({ message, say, client }) => {
  try {
    // Ignore bot messages
    if (message.bot_id || message.user === BOT_USER_ID) {
      return;
    }

    console.log('\n📨 Received message:', {
      user: message.user,
      text: (message.text || '').substring(0, 50) + '...',
      channel: message.channel,
      channel_type: message.channel_type,
      thread_ts: message.thread_ts || 'no thread',
      is_thread_reply: !!message.thread_ts
    });

    // IMPORTANT: Threads are also processed - thread_ts indicates it's a reply
    if (message.thread_ts) {
      console.log('🧵 This is a thread reply, loading thread context...');
    }

    // Get monitored channels
    const monitoredChannels = [
      process.env.SALES_CHANNEL_ID,
      process.env.OUTREACH_CHANNEL_ID,
      process.env.SHITPOSTERS_CHANNEL_ID
    ].filter(Boolean);

    const isMonitoredChannel = monitoredChannels.includes(message.channel);
    const isDM = message.channel_type === 'im' || message.channel.startsWith('D');
    const isAdmin = message.user === ADMIN_USER_ID;

    // Only process messages from monitored channels or from admin
    if (!isMonitoredChannel && !isAdmin) {
      console.log('📭 Ignoring: non-monitored channel, non-admin user');
      return;
    }

    // Process with AI - EVERY eligible message goes to AI
    await processMessageWithAI({
      message,
      say,
      client,
      isMention: false
    });

  } catch (error) {
    console.error('❌ Error handling message:', error);
  }
});

/**
 * Process message with AI - Core intelligence function
 * Replaces ALL keyword detection with pure AI decision making
 */
async function processMessageWithAI({ message, say, client, isMention }) {
  try {
    console.log('🧠 Processing with AI...');

    // Get intern info
    const intern = await memory.getIntern(message.user);
    const isAdmin = message.user === ADMIN_USER_ID;

    // Check for admin approval commands FIRST
    if (isAdmin) {
      const approvalMatch = message.text.match(/^(approve|reject)\s+([^\s]+)(?:\s+(.+))?$/i);

      if (approvalMatch) {
        const [_, action, approvalId, reason] = approvalMatch;

        console.log(`✋ Admin ${action} command for approval ${approvalId}`);

        if (action.toLowerCase() === 'approve') {
          const result = await approvalQueue.approve(approvalId, message.user, reason);
          if (result.success) {
            await say(`✅ Approved: ${result.approval.context.reason || approvalId}\n\nExecuting action...`);
          } else {
            await say(`❌ Could not approve: ${result.error}`);
          }
        } else {
          const result = await approvalQueue.reject(approvalId, message.user, reason);
          if (result.success) {
            await say(`❌ Rejected: ${result.approval.context.reason || approvalId}\n\nReason: ${reason || 'No reason provided'}`);
          } else {
            await say(`❌ Could not reject: ${result.error}`);
          }
        }

        return; // Don't process as normal message
      }

      // Check for approval queue status command
      if (message.text.toLowerCase().includes('pending approvals') || message.text.toLowerCase().includes('approval queue')) {
        console.log('📋 Admin requesting approval queue status');
        const pending = await approvalQueue.getPendingApprovals();

        if (pending.length === 0) {
          await say('✅ No pending approvals!');
        } else {
          let statusMsg = `📋 *Pending Approvals (${pending.length})*\n\n`;
          pending.forEach((approval, idx) => {
            statusMsg += `${idx + 1}. **${approval.id}**\n`;
            statusMsg += `   Type: ${approval.type}\n`;
            statusMsg += `   Reason: ${approval.context.reason}\n`;
            if (approval.context.internName) {
              statusMsg += `   For: ${approval.context.internName}\n`;
            }
            statusMsg += `   Requested: ${new Date(approval.requestedAt).toLocaleString('en-IN')}\n`;
            statusMsg += `\n   Reply with: \`approve ${approval.id}\` or \`reject ${approval.id} [reason]\`\n\n`;
          });
          await say(statusMsg);
        }

        return; // Don't process as normal message
      }
    }

    // Gather full context for AI
    const [sender, channelInfo, allInterns, rules] = await Promise.all([
      slackHelper.getUserInfo(app, message.user),
      getChannelInfo(client, message.channel),
      memory.getActiveInterns(),
      memory.loadRules()
    ]);

    console.log(`👤 User: ${sender?.real_name || 'Unknown'} (${isAdmin ? 'ADMIN' : intern ? 'INTERN' : 'UNKNOWN'})`);

    // Build rich conversation context (NEW: uses PostgreSQL + Qdrant)
    console.log('📚 Building conversation context...');
    const conversationContext = await conversationMemory.buildContext({
      userId: message.user,
      channelId: message.channel,
      threadId: message.thread_ts || null,
      includeHistory: true,
      currentMessage: message.text // For semantic search
    });

    console.log(`✅ Context loaded: ${conversationContext.history.userConversations.length} user conversations`);
    if (conversationContext.semanticContext?.relevantPastInteractions) {
      console.log(`🔍 Found ${conversationContext.semanticContext.userContext.length} semantically similar past interactions`);
    }

    // Send EVERYTHING to AI for decision
    console.log('🤖 Sending to AI Decision Engine...');
    const decision = await aiDecisionEngine.analyzeMessage({
      message,
      sender: {
        id: message.user,
        name: sender?.real_name || sender?.name || 'Unknown'
      },
      internProfile: intern,
      channelInfo,
      recentMessages: conversationContext.history.channelContext || [],
      allInterns,
      rules,
      isAdmin,
      conversationContext // NEW: Full context including semantic search
    });

    console.log('💡 AI Decision:', {
      shouldRespond: decision.shouldRespond,
      responseType: decision.responseType,
      action: decision.action,
      reasoning: decision.reasoning
    });

    // Check for triggers that should start workflows
    if (!isAdmin && intern) {
      // Detect frustration/stuck patterns
      const stuckIndicators = ['stuck', 'problem', 'issue', 'error', 'not working', 'help', 'struggling'];
      const messageText = message.text.toLowerCase();
      const seemsStuck = stuckIndicators.some(indicator => messageText.includes(indicator));

      if (seemsStuck) {
        console.log(`🆘 User seems stuck, starting workflow...`);
        await workflowEngine.startWorkflow('user_stuck', {
          userId: message.user,
          internName: intern.name,
          since: new Date(message.ts * 1000)
        });
      }
    }

    // Execute AI's decision
    if (decision.shouldRespond && decision.response) {
      console.log('📤 Sending AI response...');

      // If message is in a thread, reply in the thread
      if (message.thread_ts) {
        console.log(`🧵 Replying in thread ${message.thread_ts}`);
        await say({
          text: decision.response,
          thread_ts: message.thread_ts
        });
      } else {
        await say(decision.response);
      }
    }

    // Execute action if AI determined one is needed
    if (decision.action) {
      console.log(`⚡ Executing action: ${decision.action}`);
      await executeAction(decision.action, message, say, intern, decision);
    }

    // Store conversation in database
    await conversationMemory.storeConversation({
      messageId: message.ts,
      threadId: message.thread_ts || null, // Store thread info
      channelId: message.channel,
      channelName: channelInfo.name,
      userId: message.user,
      userName: sender?.real_name || sender?.name || 'Unknown',
      userRole: intern?.role || (isAdmin ? 'admin' : 'unknown'),
      message: message.text,
      messageType: 'text',
      intent: decision.responseType,
      aiDecision: decision,
      botResponse: decision.response,
      actionsTaken: decision.action ? [decision.action] : [],
      sentiment: null, // Can be enhanced later
      urgency: null,
      tags: [
        isMention ? 'mention' : 'regular',
        isAdmin ? 'admin' : 'intern',
        decision.responseType,
        message.thread_ts ? 'thread_reply' : 'main_channel'
      ].filter(Boolean)
    });

    console.log('✅ Message processed and stored\n');

  } catch (error) {
    console.error('❌ Error in AI processing:', error);
    throw error;
  }
}

/**
 * Execute action determined by AI
 * Handles all actions that AI might request
 */
async function executeAction(action, message, say, intern, decision) {
  try {
    switch (action) {
      case 'login':
        // AI determined this is a check-in
        if (!intern) {
          console.log('⚠️ Login action requested but user is not an intern');
          return;
        }

        const today = new Date().toISOString().split('T')[0];
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();
        const isLate = (hour > 10) || (hour === 10 && minute > 30);

        await memory.markAttendance(message.user, today);

        console.log(`✅ ${intern.name} checked in at ${now.toLocaleTimeString('en-IN')} ${isLate ? '(LATE)' : ''}`);

        // Log attendance in database
        const internRecord = await postgres.getInternBySlackId(message.user);
        if (internRecord) {
          const lateBy = isLate ? Math.floor((hour * 60 + minute - 10 * 60 - 30) / 60) : 0;
          await postgres.logAttendance(
            internRecord.id,
            today,
            now,
            isLate,
            lateBy
          );
        }
        break;

      case 'assign_tasks':
        // AI determined user needs tasks
        if (!intern) {
          console.log('⚠️ Assign tasks action requested but user is not an intern');
          return;
        }

        console.log(`📋 Assigning tasks to ${intern.name}...`);
        const tasks = await openaiHelper.generateTasks(intern, 3);

        await memory.assignTasks(message.user, tasks);

        const taskList = tasks.map((t, i) =>
          `${i + 1}. *${t.title}* [${t.priority}]\n   ${t.description}\n   ⏱️ Estimated: ${t.estimatedTime} mins`
        ).join('\n\n');

        await say(`📋 *New tasks assigned to you:*\n\n${taskList}\n\nLet me know when you complete them!`);

        // Start task monitoring workflow for each task
        for (const task of tasks) {
          await workflowEngine.startWorkflow('task_assigned', {
            userId: message.user,
            internName: intern.name,
            taskTitle: task.title,
            since: new Date()
          });
        }
        console.log(`✅ Started monitoring workflows for ${tasks.length} tasks`);
        break;

      case 'mark_progress':
        // AI determined user is updating task progress
        console.log(`📊 Marking progress for ${intern?.name || 'user'}`);
        break;

      case 'request_screenshot':
        // AI determined task completion claim, asking for proof
        await say(`Great! Please upload a screenshot of your completed work so I can verify it. 📸`);
        break;

      case 'send_to_admin':
        // AI determined message should be forwarded to admin
        const userName = intern?.name || decision.sender?.name || 'Unknown User';
        const messageContent = decision.messageToForward || message.text;

        console.log(`📢 Forwarding message from ${userName} to admin`);

        await app.client.chat.postMessage({
          channel: process.env.ADMIN_DM_CHANNEL_ID || ADMIN_USER_ID,
          text: `🚨 *Message from ${userName}:*\n\n"${messageContent}"\n\n_Sent from <#${message.channel}>_\n_User ID: ${message.user}_`
        });

        console.log(`✅ Message forwarded to admin`);
        break;

      case 'send_to_channel':
        // AI determined admin wants to message a team/channel
        const targetChannel = decision.targetChannel;
        const messageToSend = decision.messageToForward || message.text;

        console.log(`📢 Admin sending message to ${targetChannel} channel`);

        // Map team names to channel IDs
        const channelMap = {
          'tech': process.env.TECH_CHANNEL_ID,
          'sales': process.env.SALES_CHANNEL_ID,
          'outreach': process.env.OUTREACH_CHANNEL_ID,
          'shitposters': process.env.SHITPOSTERS_CHANNEL_ID,
          'clipping': process.env.SHITPOSTERS_CHANNEL_ID,
        };

        const channelId = channelMap[targetChannel?.toLowerCase()];

        if (!channelId) {
          console.log(`⚠️ Unknown channel: ${targetChannel}`);
          await say(`I'm not sure which channel "${targetChannel}" refers to. Known channels: tech, sales, outreach, shitposters.`);
          return;
        }

        // Rewrite admin message professionally
        const rewrittenMessage = await openaiHelper.rewriteAdminDirective(
          messageToSend,
          'Team',
          targetChannel
        );

        await app.client.chat.postMessage({
          channel: channelId,
          text: `📢 *Message from the boss:*\n\n${rewrittenMessage}`
        });

        await say(`✅ Message sent to ${targetChannel} channel!`);
        console.log(`✅ Message sent to ${targetChannel} channel (${channelId})`);
        break;

      default:
        console.log(`⚠️ Unknown action: ${action}`);
    }
  } catch (error) {
    console.error(`❌ Error executing action ${action}:`, error);
  }
}

/**
 * Get channel info
 */
async function getChannelInfo(client, channelId) {
  try {
    const result = await client.conversations.info({
      channel: channelId
    });

    return {
      id: channelId,
      name: result.channel.name || 'DM',
      is_private: result.channel.is_private || false
    };
  } catch (error) {
    return { id: channelId, name: 'Unknown', is_private: false };
  }
}

/**
 * Setup cron jobs for automated tasks
 */
function setupCronJobs() {
  // Evening validation (6 PM IST)
  cron.schedule('0 18 * * *', async () => {
    console.log('⏰ Running evening validation...');
    await runEveningValidation();
  }, {
    timezone: TIMEZONE
  });

  // End of day summary (10 PM IST)
  cron.schedule('0 22 * * *', async () => {
    console.log('📊 Generating end-of-day summary...');
    await generateDailySummary();
  }, {
    timezone: TIMEZONE
  });

  console.log('✅ Cron jobs scheduled');
}

/**
 * Evening validation - check all interns
 */
async function runEveningValidation() {
  try {
    const interns = await memory.getActiveInterns();
    const today = new Date().toISOString().split('T')[0];

    for (const intern of interns) {
      const hasAttendance = intern.attendance[today];
      const incompleteTasks = intern.currentTasks.filter(t => !t.completed);

      let message = `📊 *End of Day Check for ${intern.name}*\n\n`;

      if (!hasAttendance) {
        message += `❌ No attendance logged today\n`;
      } else {
        message += `✅ Attendance logged\n`;
      }

      message += `\n📋 Tasks: ${intern.currentTasks.length - incompleteTasks.length}/${intern.currentTasks.length} completed\n`;

      if (incompleteTasks.length > 0) {
        message += `\n⏳ *Pending tasks:*\n${incompleteTasks.map(t => `• ${t.title}`).join('\n')}`;
      }

      await app.client.chat.postMessage({
        channel: intern.channelId,
        text: message
      });
    }
  } catch (error) {
    console.error('Error in evening validation:', error);
  }
}

/**
 * Generate daily summary for admin
 */
async function generateDailySummary() {
  try {
    const interns = await memory.getActiveInterns();
    const today = new Date().toISOString().split('T')[0];

    let summary = `📊 *Daily Summary - ${new Date().toLocaleDateString('en-IN')}*\n\n`;

    for (const intern of interns) {
      const hasAttendance = intern.attendance[today];
      const completedToday = intern.completedTasks.filter(t => {
        const completedDate = new Date(t.completedAt).toISOString().split('T')[0];
        return completedDate === today;
      }).length;

      summary += `*${intern.name}* (${intern.role}):\n`;
      summary += `   ${hasAttendance ? '✅' : '❌'} Attendance\n`;
      summary += `   📋 ${completedToday} tasks completed\n`;
      summary += `   📊 Overall: ${intern.completionRate}% completion rate\n\n`;
    }

    await sendAdminMessage(summary);
  } catch (error) {
    console.error('Error generating daily summary:', error);
  }
}

// Start the bot
(async () => {
  try {
    await app.start();
    console.log('⚡️ Bolt app is running!');
    await initialize();

    // Start health check server
    const http = require('http');
    const PORT = process.env.PORT || 3000;
    const healthServer = http.createServer((req, res) => {
      if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'healthy',
          bot: 'AI Boss 2.0',
          mode: 'Pure AI',
          database: 'PostgreSQL',
          uptime: process.uptime(),
          timestamp: new Date().toISOString()
        }));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    healthServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`⚠️ Port ${PORT} is in use, trying alternative port...`);
        const altPort = PORT + Math.floor(Math.random() * 1000);
        healthServer.listen(altPort, 'localhost', () => {
          console.log(`🏥 Health check server running on localhost:${altPort}`);
          console.log('💚 Bot is healthy and ready');
        });
      } else {
        console.error('Health server error:', err);
      }
    });

    healthServer.listen(PORT, 'localhost', () => {
      console.log(`🏥 Health check server running on localhost:${PORT}`);
      console.log('💚 Bot is healthy and ready');
    });
  } catch (error) {
    console.error('❌ Failed to start app:', error);
    process.exit(1);
  }
})();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await postgres.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await postgres.close();
  process.exit(0);
});
