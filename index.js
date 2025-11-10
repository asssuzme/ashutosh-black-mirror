/**
 * AI Boss 2.0 - Self-Learning Slack Manager
 * Main bot entry point
 */

require('dotenv').config();
const { App } = require('@slack/bolt');
const cron = require('node-cron');

// Utilities
const contextClassifier = require('./utils/contextClassifier');
const openaiHelper = require('./utils/openaiHelper');
const slackHelper = require('./utils/slackHelper');
const memory = require('./utils/memoryManager');

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
 * Handle all incoming messages
 */
app.message(async ({ message, say }) => {
  try {
    // Ignore bot messages
    if (message.bot_id || message.user === BOT_USER_ID) {
      return;
    }

    // Classify message intent
    const intent = contextClassifier.classifyIntent(message, BOT_USER_ID);
    console.log(`Message from ${message.user}: "${message.text}" -> Intent: ${intent}`);

    // Handle based on intent
    if (intent === 'ADMIN_DIRECTIVE') {
      await handleAdminDirective(message, say);
    } else if (intent === 'INTERN_TO_BOT') {
      await handleInternCommand(message, say);
    } else if (intent === 'ADMIN_MESSAGE') {
      // Admin talking in channels - just log for context
      console.log('Admin message in channel - logging for context');
    } else if (intent === 'GENERAL_CHAT') {
      // General chat - log for learning but don't respond
      await logGeneralChat(message);
    }
  } catch (error) {
    console.error('Error handling message:', error);
  }
});

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
  const intern = await memory.getIntern(message.user);

  // If intern not in system, auto-add them
  if (!intern) {
    const userInfo = await slackHelper.getUserInfo(app, message.user);
    const newIntern = {
      name: userInfo?.real_name || userInfo?.name || 'Unknown',
      slackId: message.user,
      role: 'sales', // Default role
      channelId: message.channel
    };
    await memory.addIntern(newIntern);
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
    await app.start();
    console.log('⚡️ AI Boss 2.0 is running!');

    await initialize();
  } catch (error) {
    console.error('Error starting bot:', error);
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
