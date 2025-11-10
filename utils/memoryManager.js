/**
 * Memory Manager
 * Handles reading and writing to the memory system (JSON files)
 * - Intern profiles
 * - Rules and configuration
 * - Summaries and learning data
 */

const fs = require('fs').promises;
const path = require('path');

const MEMORY_DIR = path.join(__dirname, '../memory');
const INTERNS_PATH = path.join(MEMORY_DIR, 'interns.json');
const RULES_PATH = path.join(MEMORY_DIR, 'rules.json');
const SUMMARIES_PATH = path.join(MEMORY_DIR, 'summaries.json');

/**
 * Load interns data
 * @returns {Promise<Object>} Interns data
 */
async function loadInterns() {
  try {
    const data = await fs.readFile(INTERNS_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading interns:', error);
    return { interns: [], lastUpdated: new Date().toISOString() };
  }
}

/**
 * Save interns data
 * @param {Object} data - Interns data to save
 */
async function saveInterns(data) {
  try {
    data.lastUpdated = new Date().toISOString();
    await fs.writeFile(INTERNS_PATH, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving interns:', error);
  }
}

/**
 * Get intern by Slack ID
 * @param {string} slackId - Slack user ID
 * @returns {Promise<Object|null>} Intern object or null
 */
async function getIntern(slackId) {
  const data = await loadInterns();
  return data.interns.find(i => i.slackId === slackId) || null;
}

/**
 * Add new intern
 * @param {Object} internData - Intern information
 * @returns {Promise<Object>} Added intern
 */
async function addIntern(internData) {
  const data = await loadInterns();

  const newIntern = {
    id: internData.slackId,
    name: internData.name,
    role: internData.role || 'sales',
    slackId: internData.slackId,
    channelId: internData.channelId,
    joinDate: new Date().toISOString(),
    active: true,
    attendance: {},
    currentTasks: [],
    completedTasks: [],
    progressUpdates: {},
    completionRate: 0,
    profile: {
      strengths: [],
      weaknesses: [],
      optimalWorkload: 'medium',
      motivationStyle: 'encouraging',
      performanceHistory: []
    },
    stats: {
      totalTasksAssigned: 0,
      totalTasksCompleted: 0,
      averageQualityScore: 0,
      attendanceRate: 0,
      lastActive: null
    }
  };

  data.interns.push(newIntern);
  await saveInterns(data);
  return newIntern;
}

/**
 * Update intern data
 * @param {string} slackId - Slack user ID
 * @param {Object} updates - Updates to apply
 */
async function updateIntern(slackId, updates) {
  const data = await loadInterns();
  const index = data.interns.findIndex(i => i.slackId === slackId);

  if (index !== -1) {
    data.interns[index] = { ...data.interns[index], ...updates };
    await saveInterns(data);
    return data.interns[index];
  }

  return null;
}

/**
 * Remove intern
 * @param {string} slackId - Slack user ID
 */
async function removeIntern(slackId) {
  const data = await loadInterns();
  data.interns = data.interns.filter(i => i.slackId !== slackId);
  await saveInterns(data);
}

/**
 * Mark attendance for intern
 * @param {string} slackId - Slack user ID
 * @param {string} date - Date string (YYYY-MM-DD)
 */
async function markAttendance(slackId, date = null) {
  const dateKey = date || new Date().toISOString().split('T')[0];
  const intern = await getIntern(slackId);

  if (intern) {
    intern.attendance[dateKey] = {
      loggedIn: true,
      timestamp: new Date().toISOString()
    };
    intern.stats.lastActive = new Date().toISOString();

    // Update attendance rate
    const totalDays = Object.keys(intern.attendance).length;
    const presentDays = Object.values(intern.attendance).filter(a => a.loggedIn).length;
    intern.stats.attendanceRate = Math.round((presentDays / totalDays) * 100);

    await updateIntern(slackId, intern);
  }
}

/**
 * Add progress update for intern
 * @param {string} slackId - Slack user ID
 * @param {string} update - Progress update text
 * @param {Object} analysis - AI analysis of the update
 */
async function addProgressUpdate(slackId, update, analysis = {}) {
  const dateKey = new Date().toISOString().split('T')[0];
  const intern = await getIntern(slackId);

  if (intern) {
    if (!intern.progressUpdates[dateKey]) {
      intern.progressUpdates[dateKey] = [];
    }

    intern.progressUpdates[dateKey].push({
      timestamp: new Date().toISOString(),
      update,
      analysis
    });

    await updateIntern(slackId, intern);
  }
}

/**
 * Assign tasks to intern
 * @param {string} slackId - Slack user ID
 * @param {Array} tasks - Array of task objects
 */
async function assignTasks(slackId, tasks) {
  const intern = await getIntern(slackId);

  if (intern) {
    intern.currentTasks = tasks.map(task => ({
      ...task,
      assignedAt: new Date().toISOString(),
      completed: false
    }));

    intern.stats.totalTasksAssigned += tasks.length;
    await updateIntern(slackId, intern);
  }
}

/**
 * Mark tasks as completed for intern
 * @param {string} slackId - Slack user ID
 */
async function completeTasks(slackId) {
  const intern = await getIntern(slackId);

  if (intern && intern.currentTasks.length > 0) {
    const completedCount = intern.currentTasks.filter(t => !t.completed).length;

    intern.currentTasks.forEach(task => {
      task.completed = true;
      task.completedAt = new Date().toISOString();
    });

    intern.completedTasks.push(...intern.currentTasks);
    intern.stats.totalTasksCompleted += completedCount;

    // Update completion rate
    if (intern.stats.totalTasksAssigned > 0) {
      intern.completionRate = Math.round(
        (intern.stats.totalTasksCompleted / intern.stats.totalTasksAssigned) * 100
      );
    }

    intern.currentTasks = [];
    await updateIntern(slackId, intern);
  }
}

/**
 * Get all active interns
 * @returns {Promise<Array>} Array of active interns
 */
async function getActiveInterns() {
  const data = await loadInterns();
  return data.interns.filter(i => i.active);
}

/**
 * Get interns by role
 * @param {string} role - Role name
 * @returns {Promise<Array>} Array of interns
 */
async function getInternsByRole(role) {
  const data = await loadInterns();
  return data.interns.filter(i => i.role === role && i.active);
}

/**
 * Load rules
 * @returns {Promise<Object>} Rules data
 */
async function loadRules() {
  try {
    const data = await fs.readFile(RULES_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading rules:', error);
    return { tone: 'professional', rules: [], taskGuidelines: {} };
  }
}

/**
 * Save rules
 * @param {Object} data - Rules data to save
 */
async function saveRules(data) {
  try {
    data.lastUpdated = new Date().toISOString();
    await fs.writeFile(RULES_PATH, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving rules:', error);
  }
}

/**
 * Update tone
 * @param {string} tone - New tone setting
 */
async function updateTone(tone) {
  const rules = await loadRules();
  rules.tone = tone;
  await saveRules(rules);
}

/**
 * Add custom directive
 * @param {string} directive - Directive text
 */
async function addDirective(directive) {
  const rules = await loadRules();
  if (!rules.customDirectives) {
    rules.customDirectives = [];
  }
  rules.customDirectives.push({
    text: directive,
    addedAt: new Date().toISOString()
  });
  await saveRules(rules);
}

/**
 * Load summaries
 * @returns {Promise<Object>} Summaries data
 */
async function loadSummaries() {
  try {
    const data = await fs.readFile(SUMMARIES_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading summaries:', error);
    return { dailySummaries: [], weeklySummaries: [], learningInsights: {} };
  }
}

/**
 * Save summaries
 * @param {Object} data - Summaries data to save
 */
async function saveSummaries(data) {
  try {
    data.lastUpdated = new Date().toISOString();
    await fs.writeFile(SUMMARIES_PATH, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving summaries:', error);
  }
}

/**
 * Add daily summary
 * @param {string} summary - Summary text
 * @param {Object} stats - Statistics
 */
async function addDailySummary(summary, stats) {
  const data = await loadSummaries();
  data.dailySummaries.push({
    date: new Date().toISOString().split('T')[0],
    summary,
    stats,
    timestamp: new Date().toISOString()
  });

  // Keep only last 30 days
  if (data.dailySummaries.length > 30) {
    data.dailySummaries = data.dailySummaries.slice(-30);
  }

  await saveSummaries(data);
}

/**
 * Add weekly summary
 * @param {string} summary - Summary text
 */
async function addWeeklySummary(summary) {
  const data = await loadSummaries();
  data.weeklySummaries.push({
    weekEnding: new Date().toISOString().split('T')[0],
    summary,
    timestamp: new Date().toISOString()
  });

  // Keep only last 12 weeks
  if (data.weeklySummaries.length > 12) {
    data.weeklySummaries = data.weeklySummaries.slice(-12);
  }

  await saveSummaries(data);
}

/**
 * Update learning insights
 * @param {Object} insights - Learning insights from AI
 */
async function updateLearningInsights(insights) {
  const data = await loadSummaries();
  data.learningInsights = {
    ...insights,
    lastLearningRun: new Date().toISOString()
  };
  await saveSummaries(data);
}

/**
 * Get daily stats
 * @param {string} date - Date string (YYYY-MM-DD)
 * @returns {Promise<Object>} Stats for the day
 */
async function getDailyStats(date = null) {
  const dateKey = date || new Date().toISOString().split('T')[0];
  const interns = await getActiveInterns();

  const stats = {
    date: dateKey,
    attendance: {
      total: interns.length,
      present: 0,
      rate: 0
    },
    tasksCompleted: 0,
    progressUpdates: 0,
    avgQuality: 0,
    internDetails: []
  };

  let totalQuality = 0;
  let qualityCount = 0;

  interns.forEach(intern => {
    const loggedIn = intern.attendance[dateKey]?.loggedIn || false;
    const updates = intern.progressUpdates[dateKey] || [];

    if (loggedIn) stats.attendance.present++;
    stats.progressUpdates += updates.length;

    // Count completed tasks for today
    const completedToday = intern.completedTasks.filter(
      task => task.completedAt?.startsWith(dateKey)
    ).length;
    stats.tasksCompleted += completedToday;

    // Average quality from progress updates
    updates.forEach(update => {
      if (update.analysis?.qualityScore) {
        totalQuality += update.analysis.qualityScore;
        qualityCount++;
      }
    });

    stats.internDetails.push({
      name: intern.name,
      role: intern.role,
      loggedIn,
      updatesCount: updates.length,
      tasksCompleted: completedToday
    });
  });

  stats.attendance.rate = interns.length > 0
    ? Math.round((stats.attendance.present / stats.attendance.total) * 100)
    : 0;

  stats.avgQuality = qualityCount > 0
    ? (totalQuality / qualityCount).toFixed(1)
    : 'N/A';

  return stats;
}

module.exports = {
  loadInterns,
  saveInterns,
  getIntern,
  addIntern,
  updateIntern,
  removeIntern,
  markAttendance,
  addProgressUpdate,
  assignTasks,
  completeTasks,
  getActiveInterns,
  getInternsByRole,
  loadRules,
  saveRules,
  updateTone,
  addDirective,
  loadSummaries,
  saveSummaries,
  addDailySummary,
  addWeeklySummary,
  updateLearningInsights,
  getDailyStats
};
