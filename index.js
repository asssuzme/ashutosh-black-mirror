/**
 * AI Boss 2.0 - Self-Learning Slack Manager
 * Main bot entry point
 */

require('dotenv').config();
const { App } = require('@slack/bolt');
const cron = require('node-cron');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Utilities
const contextClassifier = require('./utils/contextClassifier');
const openaiHelper = require('./utils/openaiHelper');
const slackHelper = require('./utils/slackHelper');
const memory = require('./utils/memoryManager');
const aiDecisionEngine = require('./utils/aiDecisionEngine');

// Ensure memory directory exists
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
 * Initialize bot
 */
async function initialize() {
  try {
    // Get bot user ID
    const authResult = await app.client.auth.test();
    BOT_USER_ID = authResult.user_id;

    console.log('🤖 AI Boss 2.0 initialized');
    console.log(`Bot User ID: ${BOT_USER_ID}`);
    console.log(`Admin User ID: ${ADMIN_USER_ID}`);
    console.log(`Timezone: ${TIMEZONE}`);

    // Set up cron jobs
    setupCronJobs();

    // Send startup message to admin
    await sendAdminMessage('✅ AI Boss 2.0 is online and ready to manage your teams!');
  } catch (error) {
    console.error('Error initializing bot:', error);
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
 */
app.event('app_mention', async ({ event, say }) => {
  try {
    console.log('🔔 Bot mentioned:', {
      user: event.user,
      text: event.text,
      channel: event.channel
    });

    // Treat all mentions as INTERN_TO_BOT
    await handleInternCommand(event, say);
  } catch (error) {
    console.error('❌ Error handling mention:', error);
    console.error('Stack:', error.stack);
  }
});

/**
 * Handle all incoming messages with AI-powered decision making
 */
app.message(async ({ message, say, client }) => {
  try {
    // Ignore bot messages
    if (message.bot_id || message.user === BOT_USER_ID) {
      return;
    }

    console.log('📨 Received message:', {
      user: message.user,
      text: message.text,
      channel: message.channel,
      channel_type: message.channel_type
    });

    // Quick decision for obvious cases
    const quickCheck = aiDecisionEngine.quickDecision(message, BOT_USER_ID);
    if (quickCheck === 'IGNORE') {
      return;
    }

    // Get monitored channels
    const monitoredChannels = [
      process.env.SALES_CHANNEL_ID,
      process.env.OUTREACH_CHANNEL_ID,
      process.env.SHITPOSTERS_CHANNEL_ID
    ].filter(Boolean);

    // Check if this is a monitored channel or admin DM
    const isMonitoredChannel = monitoredChannels.includes(message.channel);
    const isAdminDM = message.channel_type === 'im' && message.user === ADMIN_USER_ID;

    // Only process messages from monitored channels or admin DMs
    if (!isMonitoredChannel && !isAdminDM) {
      console.log('📭 Message from non-monitored channel, ignoring');
      return;
    }

    // Build context for AI decision
    console.log('🧠 Building context for AI decision...');

    const [sender, intern, channelInfo, recentMessages, allInterns, rules] = await Promise.all([
      slackHelper.getUserInfo(app, message.user),
      memory.getIntern(message.user),
      getChannelInfo(client, message.channel),
      getRecentMessages(client, message.channel, 5),
      memory.getActiveInterns(),
      memory.getRules()
    ]);

    const isAdmin = message.user === ADMIN_USER_ID;

    // Send to AI for decision
    const decision = await aiDecisionEngine.analyzeMessage({
      message,
      sender: {
        id: message.user,
        name: sender?.real_name || sender?.name || 'Unknown'
      },
      internProfile: intern,
      channelInfo,
      recentMessages,
      allInterns,
      rules,
      isAdmin
    });

    console.log('🤖 AI Decision:', decision);

    // Execute decision
    if (decision.shouldRespond && decision.response) {
      await say(decision.response);
    }

    // Execute action if needed
    if (decision.action) {
      await executeAction(decision.action, message, say, intern);
    }

    // Log for learning
    await logInteraction(message, decision, intern);

  } catch (error) {
    console.error('❌ Error handling message:', error);
    console.error('Stack:', error.stack);
  }
});

/**
 * Get channel information
 */
async function getChannelInfo(client, channelId) {
  try {
    if (channelId.startsWith('D')) {
      // DM channel
      return {
        id: channelId,
        name: 'Direct Message',
        type: 'im'
      };
    }

    const result = await client.conversations.info({
      channel: channelId
    });

    return {
      id: channelId,
      name: result.channel?.name || 'Unknown',
      type: 'channel'
    };
  } catch (error) {
    console.error('Error getting channel info:', error);
    return {
      id: channelId,
      name: 'Unknown',
      type: 'unknown'
    };
  }
}

/**
 * Get recent messages from channel for context
 */
async function getRecentMessages(client, channelId, limit = 5) {
  try {
    const result = await client.conversations.history({
      channel: channelId,
      limit: limit + 1 // +1 to exclude current message
    });

    return (result.messages || []).map(msg => ({
      text: msg.text,
      user: msg.user,
      user_name: msg.user_profile?.real_name || msg.user_profile?.name || 'Unknown',
      ts: msg.ts
    }));
  } catch (error) {
    console.error('Error getting recent messages:', error);
    return [];
  }
}

/**
 * Execute action decided by AI
 */
async function executeAction(action, message, say, intern) {
  try {
    console.log(`⚡ Executing action: ${action}`);

    switch (action) {
      case 'login':
        if (intern) {
          const today = new Date().toISOString().split('T')[0];
          await memory.markAttendance(message.user, today);
          console.log(`✅ Marked attendance for ${intern.name}`);
        }
        break;

      case 'assign_tasks':
        if (intern && intern.currentTasks.length === 0) {
          const tasks = await openaiHelper.generateDailyTasks(intern.role, 'medium');
          await memory.assignTasks(message.user, tasks);
          console.log(`✅ Assigned ${tasks.length} tasks to ${intern.name}`);
        }
        break;

      case 'mark_progress':
        // Progress marking handled separately
        console.log('📝 Progress update logged');
        break;

      case 'send_to_admin':
        // Notify admin of important event
        await app.client.chat.postMessage({
          channel: process.env.ADMIN_DM_CHANNEL_ID || ADMIN_USER_ID,
          text: `🚨 *Notification*\n${intern?.name || 'Someone'} needs attention:\n"${message.text}"`
        });
        console.log('📢 Notification sent to admin');
        break;

      default:
        console.log(`⚠️ Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('Error executing action:', error);
  }
}

/**
 * Log interaction for learning
 */
async function logInteraction(message, decision, intern) {
  try {
    const log = {
      timestamp: new Date().toISOString(),
      user: message.user,
      userName: intern?.name || 'Unknown',
      channel: message.channel,
      message: message.text,
      decision: {
        shouldRespond: decision.shouldRespond,
        type: decision.responseType,
        reasoning: decision.reasoning
      },
      action: decision.action
    };

    // Store in memory for learning
    const logsPath = path.join(__dirname, 'memory', 'interactions.jsonl');
    fs.appendFileSync(logsPath, JSON.stringify(log) + '\n');
  } catch (error) {
    console.error('Error logging interaction:', error);
  }
}

/**
 * Handle admin directives
 */
async function handleAdminDirective(message, say) {
  const directive = contextClassifier.parseAdminDirective(message.text);
  console.log('Admin directive:', directive);

  try {
    switch (directive.action) {
      case 'ADD_INTERN':
        await handleAddIntern(directive, say);
        break;

      case 'REMOVE_INTERN':
        await handleRemoveIntern(directive, say);
        break;

      case 'UPDATE_TONE':
        await handleUpdateTone(directive, say);
        break;

      case 'UPLOAD_DATA':
        await handleUploadData(directive, say);
        break;

      case 'GET_STATS':
        await handleGetStats(say);
        break;

      case 'AGENTIC_MESSAGE':
        await handleAgenticMessage(directive, say);
        break;

      case 'GENERAL_DIRECTIVE':
        await handleGeneralDirective(directive, say);
        break;

      default:
        await say('✅ Noted. I\'ll incorporate that into my management approach.');
    }
  } catch (error) {
    console.error('Error handling admin directive:', error);
    await say('❌ Error processing directive. Check logs for details.');
  }
}

/**
 * Handle adding new intern
 */
async function handleAddIntern(directive, say) {
  // In a real scenario, you'd look up the Slack ID by username
  // For now, we'll create a placeholder
  const internData = {
    name: directive.name,
    role: directive.role,
    slackId: 'U_PLACEHOLDER_' + Date.now(), // Replace with actual Slack ID lookup
    channelId: process.env[`${directive.role.toUpperCase()}_CHANNEL_ID`]
  };

  await memory.addIntern(internData);
  await say(slackHelper.createAdminConfirmation('ADD_INTERN', directive));
}

/**
 * Handle removing intern
 */
async function handleRemoveIntern(directive, say) {
  const interns = await memory.getActiveInterns();
  const intern = interns.find(i => i.name.toLowerCase().includes(directive.name.toLowerCase()));

  if (intern) {
    await memory.removeIntern(intern.slackId);
    await say(slackHelper.createAdminConfirmation('REMOVE_INTERN', directive));
  } else {
    await say(`❌ Intern "${directive.name}" not found.`);
  }
}

/**
 * Handle tone update
 */
async function handleUpdateTone(directive, say) {
  await memory.updateTone(directive.tone);
  await say(slackHelper.createAdminConfirmation('UPDATE_TONE', directive));
}

/**
 * Handle data upload
 */
async function handleUploadData(directive, say) {
  await memory.addDirective(directive.data);
  await say(slackHelper.createAdminConfirmation('UPLOAD_DATA', {}));
}

/**
 * Handle stats request
 */
async function handleGetStats(say) {
  const stats = await memory.getDailyStats();
  const interns = await memory.getActiveInterns();

  const summary = await openaiHelper.generateDailySummary(stats.internDetails);
  const blocks = slackHelper.formatDailySummaryBlocks(summary, stats);

  await say({ blocks });
}

/**
 * Handle agentic message - tell someone to do something
 */
async function handleAgenticMessage(directive, say) {
  const interns = await memory.getActiveInterns();
  const intern = interns.find(i =>
    i.name.toLowerCase().includes(directive.targetName.toLowerCase()) ||
    directive.targetName.toLowerCase().includes(i.name.toLowerCase())
  );

  if (!intern) {
    await say(`❌ Could not find intern "${directive.targetName}". Available interns: ${interns.map(i => i.name).join(', ')}`);
    return;
  }

  try {
    // Send message to intern in their assigned channel
    await app.client.chat.postMessage({
      channel: intern.channelId,
      text: `📢 *Message from the boss:*\n${directive.message}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📢 *Message from the boss:*\n\n${directive.message}`
          }
        }
      ]
    });

    await say(`✅ Message sent to ${intern.name} in their channel.`);
    console.log(`🎯 Agentic message sent to ${intern.name}: ${directive.message}`);
  } catch (error) {
    console.error('Error sending agentic message:', error);
    await say(`❌ Failed to send message to ${intern.name}. Error: ${error.message}`);
  }
}

/**
 * Handle blocked DM - interns should use their assigned channels
 */
async function handleBlockedDM(message, say) {
  const intern = await memory.getIntern(message.user);

  if (intern && intern.channelId) {
    await say({
      text: `🚫 Please use your assigned team channel instead of DMs.`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🚫 *DMs are disabled for interns.*\n\nPlease use your assigned team channel: <#${intern.channelId}>\n\nAll work communication should happen in your team channel so I can track your progress properly.`
          }
        }
      ]
    });
  } else {
    await say('🚫 Direct messages are only available for admins. Please use your team channel to communicate with me.');
  }
}

/**
 * Handle general directive
 */
async function handleGeneralDirective(directive, say) {
  await memory.addDirective(directive.content);
  await say('✅ Understood. I\'ve stored that directive and will apply it going forward.');
}

/**
 * Handle intern commands
 */
async function handleInternCommand(message, say) {
  const command = contextClassifier.parseCommand(message.text);
  let intern = await memory.getIntern(message.user);

  // If intern not in system, auto-add them with their current channel
  if (!intern) {
    const userInfo = await slackHelper.getUserInfo(app, message.user);
    const newIntern = {
      name: userInfo?.real_name || userInfo?.name || 'Unknown',
      slackId: message.user,
      role: 'sales', // Default role
      channelId: message.channel
    };
    await memory.addIntern(newIntern);
    intern = await memory.getIntern(message.user);
  }

  // CRITICAL: Verify intern is in their assigned channel (not admin)
  if (message.user !== ADMIN_USER_ID && message.channel !== intern.channelId) {
    console.log(`🚫 ${intern.name} tried to use bot in wrong channel. Current: ${message.channel}, Assigned: ${intern.channelId}`);

    await say({
      text: `🚫 Please use your assigned team channel.`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🚫 *Wrong channel!*\n\nYou can only interact with me in your assigned team channel: <#${intern.channelId}>\n\nPlease go there to continue.`
          }
        }
      ]
    });
    return;
  }

  try {
    switch (command.command) {
      case '/login':
        await handleLogin(message.user, say);
        break;

      case '/tasks':
        await handleTasksRequest(message.user, say);
        break;

      case '/progress':
        await handleProgressUpdate(message.user, command.parameters, say);
        break;

      case '/done':
        await handleTaskCompletion(message.user, say);
        break;

      case '/status':
        await handleStatusRequest(message.user, say);
        break;

      case '/help':
        await say(slackHelper.formatHelpMessage());
        break;

      default:
        // Natural language interaction
        await handleNaturalLanguage(message.user, message.text, say);
    }
  } catch (error) {
    console.error('Error handling intern command:', error);
    await say('❌ Something went wrong. Please try again or use `/help` for guidance.');
  }
}

/**
 * Handle login
 */
async function handleLogin(userId, say) {
  await memory.markAttendance(userId);
  const intern = await memory.getIntern(userId);

  await say(`✅ Welcome, ${intern.name}! Attendance marked for today. Ready to crush it? 💪`);

  // If no tasks assigned yet, assign them
  if (!intern.currentTasks || intern.currentTasks.length === 0) {
    await assignDailyTasks(userId);
  }
}

/**
 * Handle tasks request
 */
async function handleTasksRequest(userId, say) {
  const intern = await memory.getIntern(userId);

  if (!intern.currentTasks || intern.currentTasks.length === 0) {
    await say('No tasks assigned yet. Let me generate some for you...');
    await assignDailyTasks(userId);
  } else {
    const blocks = slackHelper.formatTasksAsBlocks(intern.currentTasks, intern.name);
    await say({ blocks });
  }
}

/**
 * Handle progress update
 */
async function handleProgressUpdate(userId, update, say) {
  const intern = await memory.getIntern(userId);

  // Analyze the update with AI
  const analysis = await openaiHelper.analyzeProgress(update, intern.profile);

  // Store the update
  await memory.addProgressUpdate(userId, update, analysis);

  // Respond based on analysis
  await say(`${analysis.feedback}`);

  // Add reaction to original message
  const sentiment = analysis.sentiment;
  const emoji = sentiment === 'positive' ? 'white_check_mark' :
                sentiment === 'negative' ? 'warning' : 'eyes';

  // Note: We'd need the message timestamp to add reaction
  // This would work in a full implementation with proper message handling
}

/**
 * Handle task completion
 */
async function handleTaskCompletion(userId, say) {
  await memory.completeTasks(userId);
  const intern = await memory.getIntern(userId);

  await say(`🎉 Awesome work, ${intern.name}! All tasks marked complete. You're crushing it today!`);
}

/**
 * Handle status request
 */
async function handleStatusRequest(userId, say) {
  const intern = await memory.getIntern(userId);
  const status = slackHelper.formatInternStatus(intern);

  await say(status);
}

/**
 * Handle natural language
 */
async function handleNaturalLanguage(userId, text, say) {
  const intern = await memory.getIntern(userId);
  const rules = await memory.loadRules();

  const response = await openaiHelper.generateResponse(text, intern.profile, rules.tone);
  await say(response);
}

/**
 * Log general chat for learning
 */
async function logGeneralChat(message) {
  // In a full implementation, this would store chat for context learning
  console.log('General chat logged for learning:', message.text);
}

/**
 * Assign daily tasks to an intern
 */
async function assignDailyTasks(userId) {
  const intern = await memory.getIntern(userId);
  const tasks = await openaiHelper.generateTasks(intern.role, intern.profile);

  await memory.assignTasks(userId, tasks);

  // Send tasks to intern
  const blocks = slackHelper.formatTasksAsBlocks(tasks, intern.name);
  await slackHelper.sendDM(app, userId, { blocks });
}

/**
 * Setup all cron jobs
 */
function setupCronJobs() {
  const rules = memory.loadRules();

  console.log('⏰ Setting up cron jobs...');

  // Daily tasks - 9 AM IST
  cron.schedule('0 9 * * *', async () => {
    console.log('Running: Daily task assignment');
    await sendDailyTasks();
  }, { timezone: TIMEZONE });

  // Login check - 10 AM IST
  cron.schedule('0 10 * * *', async () => {
    console.log('Running: Login check');
    await checkLoginStatus();
  }, { timezone: TIMEZONE });

  // Progress ping - 1 PM IST
  cron.schedule('0 13 * * *', async () => {
    console.log('Running: Progress ping');
    await sendProgressPing();
  }, { timezone: TIMEZONE });

  // End of day collection - 6 PM IST
  cron.schedule('0 18 * * *', async () => {
    console.log('Running: End of day collection');
    await collectEndOfDay();
  }, { timezone: TIMEZONE });

  // Daily summary - 6:30 PM IST
  cron.schedule('30 18 * * *', async () => {
    console.log('Running: Daily summary');
    await sendDailySummary();
  }, { timezone: TIMEZONE });

  // Weekly review - Sunday 7 PM IST
  cron.schedule('0 19 * * 0', async () => {
    console.log('Running: Weekly review');
    await sendWeeklyReview();
  }, { timezone: TIMEZONE });

  // Friday leaderboard - 6 PM IST
  cron.schedule('0 18 * * 5', async () => {
    console.log('Running: Friday leaderboard');
    await sendLeaderboard();
  }, { timezone: TIMEZONE });

  // Nightly learning - 10 PM IST
  cron.schedule('0 22 * * *', async () => {
    console.log('Running: Nightly learning');
    await runLearningJob();
  }, { timezone: TIMEZONE });

  console.log('✅ All cron jobs scheduled');
}

/**
 * Send daily tasks to all active interns
 */
async function sendDailyTasks() {
  const interns = await memory.getActiveInterns();

  for (const intern of interns) {
    await assignDailyTasks(intern.slackId);
  }

  console.log(`Sent daily tasks to ${interns.length} interns`);
}

/**
 * Check login status and remind
 */
async function checkLoginStatus() {
  const interns = await memory.getActiveInterns();
  const today = new Date().toISOString().split('T')[0];

  for (const intern of interns) {
    const loggedIn = intern.attendance[today]?.loggedIn;

    if (!loggedIn) {
      await slackHelper.sendDM(app, intern.slackId, {
        text: `⚠️ Hey ${intern.name}! Haven't seen you log in yet today. Please send "/login" or just say "here" to mark your attendance.`
      });
    }
  }
}

/**
 * Send progress ping
 */
async function sendProgressPing() {
  const interns = await memory.getActiveInterns();
  const today = new Date().toISOString().split('T')[0];

  for (const intern of interns) {
    const updates = intern.progressUpdates[today] || [];

    if (updates.length === 0) {
      await slackHelper.sendDM(app, intern.slackId, {
        text: `👋 Quick check-in, ${intern.name}! How's progress on your tasks? Send me an update using "/progress <your update>"`
      });
    }
  }
}

/**
 * Collect end of day updates
 */
async function collectEndOfDay() {
  const interns = await memory.getActiveInterns();

  for (const intern of interns) {
    if (intern.currentTasks && intern.currentTasks.length > 0) {
      const incompleteTasks = intern.currentTasks.filter(t => !t.completed);

      if (incompleteTasks.length > 0) {
        await slackHelper.sendDM(app, intern.slackId, {
          text: `📊 End of day check! You have ${incompleteTasks.length} task(s) remaining. Please send a final update or use "/done" if you've completed everything.`
        });
      }
    }
  }
}

/**
 * Send daily summary to admin
 */
async function sendDailySummary() {
  const stats = await memory.getDailyStats();
  const summary = await openaiHelper.generateDailySummary(stats.internDetails);

  await memory.addDailySummary(summary, stats);

  const blocks = slackHelper.formatDailySummaryBlocks(summary, stats);
  await sendAdminMessage('📊 Daily Performance Summary', blocks);
}

/**
 * Send weekly review to admin
 */
async function sendWeeklyReview() {
  const summaries = await memory.loadSummaries();
  const lastWeek = summaries.dailySummaries.slice(-7);

  const review = await openaiHelper.generateWeeklyReview(lastWeek);
  await memory.addWeeklySummary(review);

  const blocks = slackHelper.formatWeeklyReviewBlocks(review);
  await sendAdminMessage('📈 Weekly Performance Review', blocks);
}

/**
 * Send leaderboard
 */
async function sendLeaderboard() {
  const interns = await memory.getActiveInterns();

  // Calculate scores for the week
  const performers = interns.map(intern => ({
    name: intern.name,
    score: intern.completionRate || 0,
    tasksCompleted: intern.stats.totalTasksCompleted || 0,
    attendanceRate: intern.stats.attendanceRate || 0
  }));

  const leaderboard = openaiHelper.generateLeaderboard(performers);
  await sendAdminMessage(leaderboard);
}

/**
 * Run nightly learning job
 */
async function runLearningJob() {
  console.log('🧠 Running nightly learning job...');

  try {
    const summaries = await memory.loadSummaries();
    const interns = await memory.getActiveInterns();

    // Prepare historical data for learning
    const historicalData = {
      dailySummaries: summaries.dailySummaries.slice(-30),
      interns: interns.map(intern => ({
        name: intern.name,
        role: intern.role,
        completionRate: intern.completionRate,
        attendanceRate: intern.stats.attendanceRate,
        recentTasks: intern.completedTasks.slice(-10),
        progressUpdates: Object.values(intern.progressUpdates).flat().slice(-10)
      }))
    };

    // Run AI learning analysis
    const insights = await openaiHelper.learnFromData(historicalData);

    if (insights) {
      // Update learning insights
      await memory.updateLearningInsights(insights);

      // Update intern profiles based on insights
      for (const profile of insights.internProfiles || []) {
        const intern = interns.find(i => i.name === profile.name);
        if (intern) {
          intern.profile.strengths = profile.strengths;
          intern.profile.weaknesses = profile.weaknesses;
          intern.profile.optimalWorkload = profile.optimalWorkload;
          intern.profile.motivationStyle = profile.motivationStyle;
          await memory.updateIntern(intern.slackId, intern);
        }
      }

      console.log('✅ Learning job completed successfully');
      console.log('Insights:', insights);
    }
  } catch (error) {
    console.error('Error in learning job:', error);
  }
}

/**
 * Start the bot
 */
(async () => {
  try {
    // Validate required environment variables
    const required = [
      'SLACK_BOT_TOKEN',
      'SLACK_SIGNING_SECRET',
      'SLACK_APP_TOKEN',
      'ADMIN_USER_ID',
      'OPENAI_API_KEY'
    ];

    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
      console.error('❌ Missing required environment variables:', missing.join(', '));
      console.error('Please set these in your Railway environment variables.');
      process.exit(1);
    }

    console.log('🚀 Starting AI Boss 2.0...');
    console.log('Environment:', process.env.ENVIRONMENT || 'production');
    console.log('Socket Mode:', process.env.SLACK_APP_TOKEN ? 'Enabled' : 'Disabled');

    await app.start();
    console.log('⚡️ AI Boss 2.0 is running!');
    console.log('✅ Socket connection established');

    await initialize();

    // Start health check server
    const PORT = process.env.PORT || 3000;
    const healthServer = http.createServer((req, res) => {
      if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'healthy',
          bot: 'AI Boss 2.0',
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
    console.error('❌ Error starting bot:', error);
    console.error('Stack trace:', error.stack);

    if (error.message.includes('token')) {
      console.error('Check your Slack tokens in Railway environment variables');
    }
    if (error.message.includes('network') || error.message.includes('ECONNREFUSED')) {
      console.error('Network connectivity issue. Check Railway network settings.');
    }

    process.exit(1);
  }
})();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await app.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await app.stop();
  process.exit(0);
});
