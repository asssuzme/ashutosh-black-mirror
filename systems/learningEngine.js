/**
 * Learning Engine
 * Analyzes patterns, predicts behavior, adapts strategies
 */

const postgres = require('../database/postgres');
const qdrant = require('../database/qdrant');

/**
 * Analyze user behavior patterns and predict future behavior
 */
async function analyzeUserPatterns(userId) {
  try {
    // Get user's conversation history
    const conversations = await postgres.getUserConversationHistory(userId, 100);

    if (conversations.length === 0) {
      return null;
    }

    // Extract patterns
    const patterns = {
      // Timing patterns
      activeHours: extractActiveHours(conversations),
      averageResponseTime: calculateAverageResponseTime(conversations),
      punctuality: analyzePunctuality(userId),

      // Work patterns
      taskCompletionRate: await calculateTaskCompletionRate(userId),
      preferredTaskTypes: await analyzePreferredTasks(userId),
      productivityPeakHours: identifyPeakProductivity(conversations),

      // Communication patterns
      communicationStyle: analyzeCommunicationStyle(conversations),
      needsReminders: calculateReminderNeed(conversations),
      responseToFeedback: analyzeResponseToFeedback(conversations),

      // Behavioral predictions
      likelyToBeLateTomorrow: predictLateness(userId, conversations),
      likelyToNeedTasks: predictTaskNeed(userId, conversations),
      currentMood: analyzeSentiment(conversations.slice(-10)),
      engagementLevel: calculateEngagement(conversations)
    };

    return patterns;
  } catch (error) {
    console.error('Error analyzing user patterns:', error);
    return null;
  }
}

/**
 * Extract active hours (when user is most active)
 */
function extractActiveHours(conversations) {
  const hourCounts = {};

  conversations.forEach(conv => {
    const hour = new Date(conv.timestamp).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });

  const sortedHours = Object.entries(hourCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour]) => parseInt(hour));

  return sortedHours;
}

/**
 * Calculate average response time
 */
function calculateAverageResponseTime(conversations) {
  const responseTimes = [];

  for (let i = 1; i < conversations.length; i++) {
    if (conversations[i].botResponse && conversations[i-1].message) {
      const timeDiff = new Date(conversations[i].timestamp) - new Date(conversations[i-1].timestamp);
      responseTimes.push(timeDiff / 1000 / 60); // in minutes
    }
  }

  if (responseTimes.length === 0) return null;

  return responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
}

/**
 * Analyze punctuality patterns
 */
async function analyzePunctuality(userId) {
  try {
    const intern = await postgres.getInternBySlackId(userId);
    if (!intern) return null;

    const attendanceHistory = await postgres.getAttendanceHistory(intern.id, 30);

    const lateCount = attendanceHistory.filter(a => a.is_late).length;
    const totalDays = attendanceHistory.length;

    return {
      latePercentage: totalDays > 0 ? (lateCount / totalDays) * 100 : 0,
      averageLateBy: attendanceHistory
        .filter(a => a.is_late)
        .reduce((sum, a) => sum + a.late_by_minutes, 0) / (lateCount || 1),
      consistent: totalDays > 5 && lateCount === 0
    };
  } catch (error) {
    return null;
  }
}

/**
 * Calculate task completion rate
 */
async function calculateTaskCompletionRate(userId) {
  try {
    const intern = await postgres.getInternBySlackId(userId);
    if (!intern) return 0;

    const tasks = await postgres.getInternTasks(intern.id, true);
    const completed = tasks.filter(t => t.completed).length;

    return tasks.length > 0 ? (completed / tasks.length) * 100 : 0;
  } catch (error) {
    return 0;
  }
}

/**
 * Analyze preferred task types
 */
async function analyzePreferredTasks(userId) {
  try {
    const intern = await postgres.getInternBySlackId(userId);
    if (!intern) return [];

    const tasks = await postgres.getInternTasks(intern.id, true);
    const completedTasks = tasks.filter(t => t.completed);

    // Extract keywords from completed tasks
    const keywords = {};
    completedTasks.forEach(task => {
      const words = task.title.toLowerCase().split(' ');
      words.forEach(word => {
        if (word.length > 4) {
          keywords[word] = (keywords[word] || 0) + 1;
        }
      });
    });

    return Object.entries(keywords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  } catch (error) {
    return [];
  }
}

/**
 * Identify peak productivity hours
 */
function identifyPeakProductivity(conversations) {
  const taskCompletions = conversations.filter(c =>
    c.intent === 'task_update' && c.message.toLowerCase().includes('done')
  );

  const hourCounts = {};
  taskCompletions.forEach(conv => {
    const hour = new Date(conv.timestamp).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });

  const peakHour = Object.entries(hourCounts)
    .sort((a, b) => b[1] - a[1])[0];

  return peakHour ? parseInt(peakHour[0]) : null;
}

/**
 * Analyze communication style
 */
function analyzeCommunicationStyle(conversations) {
  const messages = conversations.map(c => c.message).join(' ').toLowerCase();

  const style = {
    formal: messages.includes('please') || messages.includes('thank you'),
    casual: messages.includes('hey') || messages.includes('yeah'),
    brief: conversations.reduce((sum, c) => sum + c.message.length, 0) / conversations.length < 50,
    verbose: conversations.reduce((sum, c) => sum + c.message.length, 0) / conversations.length > 100
  };

  return Object.entries(style)
    .filter(([_, value]) => value)
    .map(([key]) => key);
}

/**
 * Calculate if user needs reminders
 */
function calculateReminderNeed(conversations) {
  const reminders = conversations.filter(c =>
    c.botResponse && c.botResponse.toLowerCase().includes('reminder')
  );

  const actedOnReminders = reminders.filter((_, i, arr) => {
    const nextMsg = arr[i + 1];
    return nextMsg && (new Date(nextMsg.timestamp) - new Date(_.timestamp)) < 3600000;
  });

  return reminders.length > 3 && actedOnReminders.length / reminders.length > 0.7;
}

/**
 * Analyze response to feedback
 */
function analyzeResponseToFeedback(conversations) {
  const feedbackMessages = conversations.filter(c =>
    c.botResponse && (
      c.botResponse.includes('great job') ||
      c.botResponse.includes('needs improvement') ||
      c.botResponse.includes('well done')
    )
  );

  // Check if performance improved after feedback
  const improvedAfterFeedback = feedbackMessages.filter((feedback, i) => {
    const laterMessages = conversations.slice(i + 1, i + 6);
    return laterMessages.some(m => m.intent === 'task_update' && m.actionsTaken.includes('mark_complete'));
  });

  return {
    responsive: feedbackMessages.length > 0 && improvedAfterFeedback.length / feedbackMessages.length > 0.5,
    needsEncouragement: feedbackMessages.some(f => f.botResponse.includes('great job'))
  };
}

/**
 * Predict likelihood of being late tomorrow
 */
function predictLateness(userId, conversations) {
  // Simple ML: if late in last 3 days, likely late tomorrow
  const recentCheckIns = conversations
    .filter(c => c.intent === 'check_in')
    .slice(-3);

  const lateCheckIns = recentCheckIns.filter(c => {
    const hour = new Date(c.timestamp).getHours();
    return hour > 10 || (hour === 10 && new Date(c.timestamp).getMinutes() > 30);
  });

  return lateCheckIns.length >= 2;
}

/**
 * Predict if user will need tasks assigned
 */
function predictTaskNeed(userId, conversations) {
  const taskRequests = conversations.filter(c =>
    c.message.toLowerCase().includes('task') ||
    c.message.toLowerCase().includes('what should i do') ||
    c.message.toLowerCase().includes('assign')
  );

  const recentTaskRequest = taskRequests.find(c => {
    const daysSince = (Date.now() - new Date(c.timestamp)) / (1000 * 60 * 60 * 24);
    return daysSince < 1;
  });

  return !!recentTaskRequest || taskRequests.length > 3;
}

/**
 * Analyze sentiment from recent messages
 */
function analyzeSentiment(recentMessages) {
  const positiveWords = ['great', 'good', 'awesome', 'thanks', 'done', 'finished', 'ready'];
  const negativeWords = ['stuck', 'problem', 'issue', 'cant', 'difficult', 'confused', 'help'];

  let sentiment = 0;
  recentMessages.forEach(msg => {
    const text = msg.message.toLowerCase();
    positiveWords.forEach(word => {
      if (text.includes(word)) sentiment += 1;
    });
    negativeWords.forEach(word => {
      if (text.includes(word)) sentiment -= 1;
    });
  });

  if (sentiment > 2) return 'positive';
  if (sentiment < -2) return 'negative';
  return 'neutral';
}

/**
 * Calculate engagement level
 */
function calculateEngagement(conversations) {
  const last7Days = conversations.filter(c => {
    const daysSince = (Date.now() - new Date(c.timestamp)) / (1000 * 60 * 60 * 24);
    return daysSince <= 7;
  });

  const messagesPerDay = last7Days.length / 7;

  if (messagesPerDay > 10) return 'high';
  if (messagesPerDay > 5) return 'medium';
  return 'low';
}

/**
 * Generate insights for admin
 */
async function generateTeamInsights(allInterns) {
  const insights = {
    timestamp: new Date(),
    teamSize: allInterns.length,
    alerts: [],
    predictions: [],
    recommendations: []
  };

  for (const intern of allInterns) {
    const patterns = await analyzeUserPatterns(intern.slackId);

    if (!patterns) continue;

    // Generate alerts
    if (patterns.likelyToBeLateTomorrow) {
      insights.alerts.push({
        type: 'punctuality_risk',
        severity: 'medium',
        user: intern.name,
        message: `${intern.name} is likely to be late tomorrow based on recent patterns`
      });
    }

    if (patterns.currentMood === 'negative') {
      insights.alerts.push({
        type: 'morale_concern',
        severity: 'high',
        user: intern.name,
        message: `${intern.name} seems frustrated or stuck based on recent messages`
      });
    }

    if (patterns.taskCompletionRate < 50) {
      insights.alerts.push({
        type: 'performance_concern',
        severity: 'high',
        user: intern.name,
        message: `${intern.name} has low task completion rate (${patterns.taskCompletionRate.toFixed(0)}%)`
      });
    }

    // Generate predictions
    if (patterns.likelyToNeedTasks) {
      insights.predictions.push({
        user: intern.name,
        prediction: 'will_need_tasks',
        confidence: 0.8,
        action: 'Prepare tasks for assignment'
      });
    }

    // Generate recommendations
    if (patterns.productivityPeakHours) {
      insights.recommendations.push({
        user: intern.name,
        recommendation: `Assign complex tasks around ${patterns.productivityPeakHours}:00 - their peak productivity hour`
      });
    }

    if (patterns.needsReminders) {
      insights.recommendations.push({
        user: intern.name,
        recommendation: 'Schedule automated reminders for this person - they respond well to them'
      });
    }
  }

  return insights;
}

module.exports = {
  analyzeUserPatterns,
  generateTeamInsights
};
