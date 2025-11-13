/**
 * PostgreSQL Database Connection and Query Interface
 * Replaces file-based storage with proper relational database
 */

const { Pool } = require('pg');

let pool = null;

/**
 * Initialize PostgreSQL connection pool
 */
function initializePool() {
  if (pool) return pool;

  const config = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'aiboss',
    user: process.env.POSTGRES_USER || 'aiboss',
    password: process.env.POSTGRES_PASSWORD,
    max: 20, // Maximum number of clients in pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };

  pool = new Pool(config);

  pool.on('error', (err) => {
    console.error('🔴 Unexpected error on idle PostgreSQL client', err);
  });

  pool.on('connect', () => {
    console.log('✅ PostgreSQL client connected');
  });

  return pool;
}

/**
 * Get database pool (lazy initialization)
 */
function getPool() {
  if (!pool) {
    initializePool();
  }
  return pool;
}

/**
 * Execute a query with parameters
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await getPool().query(text, params);
    const duration = Date.now() - start;
    console.log('📊 Query executed', { duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('🔴 Database query error:', error);
    throw error;
  }
}

/**
 * Execute a transaction
 */
async function transaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Close all database connections
 */
async function close() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('🔌 PostgreSQL connections closed');
  }
}

// ==================================
// INTERNS QUERIES
// ==================================

/**
 * Get intern by Slack ID
 */
async function getInternBySlackId(slackId) {
  const res = await query(
    'SELECT * FROM interns WHERE slack_id = $1',
    [slackId]
  );
  return res.rows[0] || null;
}

/**
 * Get all active interns
 */
async function getAllActiveInterns() {
  const res = await query(
    'SELECT * FROM interns WHERE active = true ORDER BY name'
  );
  return res.rows;
}

/**
 * Create or update intern
 */
async function upsertIntern(internData) {
  const {
    slackId,
    name,
    role,
    channelId,
    strengths = [],
    weaknesses = [],
    optimalWorkload = 'medium',
    motivationStyle = 'encouraging'
  } = internData;

  const res = await query(
    `INSERT INTO interns (
      slack_id, name, role, channel_id,
      strengths, weaknesses, optimal_workload, motivation_style
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (slack_id) DO UPDATE SET
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      channel_id = EXCLUDED.channel_id,
      strengths = EXCLUDED.strengths,
      weaknesses = EXCLUDED.weaknesses,
      optimal_workload = EXCLUDED.optimal_workload,
      motivation_style = EXCLUDED.motivation_style,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *`,
    [slackId, name, role, channelId, strengths, weaknesses, optimalWorkload, motivationStyle]
  );

  return res.rows[0];
}

/**
 * Update intern stats
 */
async function updateInternStats(internId, stats) {
  const {
    totalTasksAssigned,
    totalTasksCompleted,
    averageQualityScore,
    attendanceRate,
    completionRate
  } = stats;

  const res = await query(
    `UPDATE interns SET
      total_tasks_assigned = $2,
      total_tasks_completed = $3,
      average_quality_score = $4,
      attendance_rate = $5,
      completion_rate = $6,
      last_active = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *`,
    [
      internId,
      totalTasksAssigned,
      totalTasksCompleted,
      averageQualityScore,
      attendanceRate,
      completionRate
    ]
  );

  return res.rows[0];
}

// ==================================
// CONVERSATIONS QUERIES
// ==================================

/**
 * Store a conversation
 */
async function storeConversation(conversationData) {
  const {
    messageId,
    threadId,
    channelId,
    channelName,
    userId,
    userName,
    userRole,
    internId,
    message,
    messageType = 'text',
    intent,
    aiDecision,
    botResponse,
    actionsTaken = [],
    timeOfDay,
    dayOfWeek,
    isFirstMessageOfDay = false,
    sentiment,
    urgency,
    tags = [],
    embeddingId,
    timestamp
  } = conversationData;

  const res = await query(
    `INSERT INTO conversations (
      message_id, thread_id, channel_id, channel_name,
      user_id, user_name, user_role, intern_id,
      message, message_type, intent, ai_decision,
      bot_response, actions_taken, time_of_day, day_of_week,
      is_first_message_of_day, sentiment, urgency, tags,
      embedding_id, timestamp
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
      $21, $22
    ) RETURNING *`,
    [
      messageId, threadId, channelId, channelName,
      userId, userName, userRole, internId,
      message, messageType, intent, aiDecision ? JSON.stringify(aiDecision) : null,
      botResponse, actionsTaken, timeOfDay, dayOfWeek,
      isFirstMessageOfDay, sentiment, urgency, tags,
      embeddingId, timestamp || new Date()
    ]
  );

  return res.rows[0];
}

/**
 * Get user conversation history
 */
async function getUserConversationHistory(userId, limit = 20) {
  const res = await query(
    `SELECT * FROM conversations
    WHERE user_id = $1
    ORDER BY timestamp DESC
    LIMIT $2`,
    [userId, limit]
  );

  return res.rows.reverse(); // Return chronological order
}

/**
 * Get channel conversation history
 */
async function getChannelConversationHistory(channelId, limit = 50) {
  const res = await query(
    `SELECT * FROM conversations
    WHERE channel_id = $1
    ORDER BY timestamp DESC
    LIMIT $2`,
    [channelId, limit]
  );

  return res.rows.reverse();
}

/**
 * Get thread conversation history
 */
async function getThreadHistory(threadId) {
  const res = await query(
    `SELECT * FROM conversations
    WHERE thread_id = $1 OR message_id = $1
    ORDER BY timestamp ASC`,
    [threadId]
  );

  return res.rows;
}

/**
 * Search conversations by text
 */
async function searchConversations(searchQuery, limit = 10) {
  const res = await query(
    `SELECT * FROM conversations
    WHERE to_tsvector('english', message) @@ plainto_tsquery('english', $1)
    OR (bot_response IS NOT NULL AND to_tsvector('english', bot_response) @@ plainto_tsquery('english', $1))
    ORDER BY timestamp DESC
    LIMIT $2`,
    [searchQuery, limit]
  );

  return res.rows;
}

// ==================================
// ATTENDANCE QUERIES
// ==================================

/**
 * Log attendance for intern
 */
async function logAttendance(internId, date, loginTime, isLate = false, lateByMinutes = 0) {
  const res = await query(
    `INSERT INTO attendance (
      intern_id, date, logged_in, login_time, is_late, late_by_minutes
    ) VALUES ($1, $2, true, $3, $4, $5)
    ON CONFLICT (intern_id, date) DO UPDATE SET
      login_time = EXCLUDED.login_time,
      is_late = EXCLUDED.is_late,
      late_by_minutes = EXCLUDED.late_by_minutes,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *`,
    [internId, date, loginTime, isLate, lateByMinutes]
  );

  return res.rows[0];
}

/**
 * Get attendance for date
 */
async function getAttendanceForDate(internId, date) {
  const res = await query(
    'SELECT * FROM attendance WHERE intern_id = $1 AND date = $2',
    [internId, date]
  );

  return res.rows[0] || null;
}

/**
 * Get attendance history for intern
 */
async function getAttendanceHistory(internId, limit = 30) {
  const res = await query(
    `SELECT * FROM attendance
    WHERE intern_id = $1
    ORDER BY date DESC
    LIMIT $2`,
    [internId, limit]
  );

  return res.rows;
}

// ==================================
// TASKS QUERIES
// ==================================

/**
 * Create task
 */
async function createTask(taskData) {
  const {
    internId,
    title,
    description,
    priority = 'medium',
    estimatedTime,
    dueDate
  } = taskData;

  const res = await query(
    `INSERT INTO tasks (
      intern_id, title, description, priority, estimated_time, due_date
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [internId, title, description, priority, estimatedTime, dueDate]
  );

  return res.rows[0];
}

/**
 * Get intern's current tasks
 */
async function getInternTasks(internId, includeCompleted = false) {
  const query_text = includeCompleted
    ? 'SELECT * FROM tasks WHERE intern_id = $1 ORDER BY assigned_at DESC'
    : 'SELECT * FROM tasks WHERE intern_id = $1 AND completed = false ORDER BY priority DESC, assigned_at DESC';

  const res = await query(query_text, [internId]);
  return res.rows;
}

/**
 * Update task status
 */
async function updateTaskStatus(taskId, status, completed = false, completedAt = null) {
  const res = await query(
    `UPDATE tasks SET
      status = $2,
      completed = $3,
      completed_at = $4,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *`,
    [taskId, status, completed, completedAt]
  );

  return res.rows[0];
}

/**
 * Add task screenshot
 */
async function addTaskScreenshot(taskId, screenshotUrl, verified = false, verificationNotes = null) {
  const res = await query(
    `UPDATE tasks SET
      screenshot_url = $2,
      screenshot_verified = $3,
      verification_notes = $4,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *`,
    [taskId, screenshotUrl, verified, verificationNotes]
  );

  return res.rows[0];
}

// ==================================
// CONTEXT INDEX QUERIES
// ==================================

/**
 * Update context index
 */
async function updateContextIndex(indexType, indexKey, metadata) {
  const res = await query(
    `INSERT INTO context_index (index_type, index_key, total_messages, last_seen, metadata)
    VALUES ($1, $2, 1, CURRENT_TIMESTAMP, $3)
    ON CONFLICT (index_type, index_key) DO UPDATE SET
      total_messages = context_index.total_messages + 1,
      last_seen = CURRENT_TIMESTAMP,
      metadata = $3,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *`,
    [indexType, indexKey, JSON.stringify(metadata)]
  );

  return res.rows[0];
}

// ==================================
// ANALYTICS QUERIES
// ==================================

/**
 * Get memory statistics
 */
async function getMemoryStats() {
  const [conversations, users, channels, threads] = await Promise.all([
    query('SELECT COUNT(*) as count FROM conversations'),
    query('SELECT COUNT(DISTINCT user_id) as count FROM conversations'),
    query('SELECT COUNT(DISTINCT channel_id) as count FROM conversations'),
    query('SELECT COUNT(DISTINCT thread_id) as count FROM conversations WHERE thread_id IS NOT NULL')
  ]);

  const oldest = await query('SELECT MIN(timestamp) as oldest FROM conversations');
  const newest = await query('SELECT MAX(timestamp) as newest FROM conversations');

  return {
    totalConversations: parseInt(conversations.rows[0].count),
    totalUsers: parseInt(users.rows[0].count),
    totalChannels: parseInt(channels.rows[0].count),
    totalThreads: parseInt(threads.rows[0].count),
    oldestConversation: oldest.rows[0].oldest,
    newestConversation: newest.rows[0].newest
  };
}

module.exports = {
  initializePool,
  getPool,
  query,
  transaction,
  close,

  // Interns
  getInternBySlackId,
  getAllActiveInterns,
  upsertIntern,
  updateInternStats,

  // Conversations
  storeConversation,
  getUserConversationHistory,
  getChannelConversationHistory,
  getThreadHistory,
  searchConversations,

  // Attendance
  logAttendance,
  getAttendanceForDate,
  getAttendanceHistory,

  // Tasks
  createTask,
  getInternTasks,
  updateTaskStatus,
  addTaskScreenshot,

  // Context
  updateContextIndex,

  // Analytics
  getMemoryStats
};
