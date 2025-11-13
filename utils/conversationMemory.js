/**
 * Conversation Memory System V2
 * Database-backed version using PostgreSQL and Qdrant
 *
 * Architecture:
 * - PostgreSQL for structured data and fast queries
 * - Qdrant for semantic search and contextual understanding
 * - Maintains same API as file-based version for backward compatibility
 */

const postgres = require('../database/postgres');
const qdrant = require('../database/qdrant');

// Fallback to old file-based memory if database not available
const fallbackMemory = require('./conversationMemory-v1-backup');

/**
 * Store a conversation turn (message + bot response)
 * Now stores in both PostgreSQL and Qdrant for semantic search
 * Falls back to file-based if database not set up
 */
async function storeConversation(data) {
  try {
    const timestamp = new Date();

    // Get intern ID from Slack ID if available
    let internId = null;
    if (data.userId) {
      try {
        const intern = await postgres.getInternBySlackId(data.userId);
        internId = intern?.id || null;
      } catch (error) {
        // Intern not in database yet, that's okay
      }
    }

    const conversationData = {
      messageId: data.messageId || data.ts,
      threadId: data.threadId || data.thread_ts || null,
      channelId: data.channelId,
      channelName: data.channelName || null,
      userId: data.userId,
      userName: data.userName,
      userRole: data.userRole || null,
      internId: internId,
      message: data.message,
      messageType: data.messageType || 'text',
      intent: data.intent || null,
      aiDecision: data.aiDecision || null,
      botResponse: data.botResponse || null,
      actionsTaken: data.actionsTaken || [],
      timeOfDay: timestamp.getHours(),
      dayOfWeek: timestamp.getDay(),
      isFirstMessageOfDay: data.isFirstMessageOfDay || false,
      sentiment: data.sentiment || null,
      urgency: data.urgency || null,
      tags: data.tags || [],
      embeddingId: data.messageId || data.ts,
      timestamp: timestamp
    };

    // Store in PostgreSQL
    const dbEntry = await postgres.storeConversation(conversationData);

    // Store embedding in Qdrant (async - don't wait)
    qdrant.storeConversationEmbedding(conversationData).catch(error => {
      console.error('⚠️  Failed to store embedding:', error);
    });

    // Update context index
    try {
      await updateContextIndex({
        userId: data.userId,
        channelId: data.channelId,
        threadId: conversationData.threadId
      });
    } catch (error) {
      // Context index update failed, continue anyway
    }

    return {
      timestamp: dbEntry.timestamp,
      messageId: dbEntry.message_id,
      threadId: dbEntry.thread_id,
      channelId: dbEntry.channel_id,
      channelName: dbEntry.channel_name,
      userId: dbEntry.user_id,
      userName: dbEntry.user_name,
      userRole: dbEntry.user_role,
      message: dbEntry.message,
      messageType: dbEntry.message_type,
      intent: dbEntry.intent,
      aiDecision: dbEntry.ai_decision,
      botResponse: dbEntry.bot_response,
      actionsTaken: dbEntry.actions_taken,
      timeOfDay: dbEntry.time_of_day,
      dayOfWeek: dbEntry.day_of_week,
      isFirstMessageOfDay: dbEntry.is_first_message_of_day,
      sentiment: dbEntry.sentiment,
      urgency: dbEntry.urgency,
      tags: dbEntry.tags
    };
  } catch (error) {
    console.error('⚠️  Database not available, using file-based fallback:', error.message);
    // Fallback to file-based memory
    return fallbackMemory.storeConversation(data);
  }
}

/**
 * Get recent conversation history for a user
 */
async function getUserConversationHistory(userId, limit = 20) {
  const rows = await postgres.getUserConversationHistory(userId, limit);

  return rows.map(row => ({
    timestamp: row.timestamp,
    messageId: row.message_id,
    threadId: row.thread_id,
    channelId: row.channel_id,
    channelName: row.channel_name,
    userId: row.user_id,
    userName: row.user_name,
    userRole: row.user_role,
    message: row.message,
    messageType: row.message_type,
    intent: row.intent,
    aiDecision: row.ai_decision,
    botResponse: row.bot_response,
    actionsTaken: row.actions_taken,
    timeOfDay: row.time_of_day,
    dayOfWeek: row.day_of_week,
    isFirstMessageOfDay: row.is_first_message_of_day,
    sentiment: row.sentiment,
    urgency: row.urgency,
    tags: row.tags
  }));
}

/**
 * Get conversation history for a specific channel
 */
async function getChannelConversationHistory(channelId, limit = 50) {
  const rows = await postgres.getChannelConversationHistory(channelId, limit);

  return rows.map(row => ({
    timestamp: row.timestamp,
    messageId: row.message_id,
    userId: row.user_id,
    userName: row.user_name,
    message: row.message,
    botResponse: row.bot_response,
    intent: row.intent,
    actionsTaken: row.actions_taken
  }));
}

/**
 * Get thread conversation history
 */
async function getThreadHistory(threadId) {
  const rows = await postgres.getThreadHistory(threadId);

  return rows.map(row => ({
    timestamp: row.timestamp,
    messageId: row.message_id,
    userId: row.user_id,
    userName: row.user_name,
    message: row.message,
    botResponse: row.bot_response,
    intent: row.intent,
    actionsTaken: row.actions_taken
  }));
}

/**
 * Build rich context for AI decision making
 * Now includes semantic search for truly intelligent context
 * Falls back to file-based if database not set up
 */
async function buildContext(params) {
  try {
    const { userId, channelId, threadId, includeHistory = true } = params;

    const context = {
      timestamp: new Date().toISOString(),
      userId,
      channelId,
      threadId,
      history: {}
    };

    if (includeHistory) {
      console.log('🔍 Loading conversation context from database...');

      // Get user's recent conversations from PostgreSQL
      try {
        const userConversations = await getUserConversationHistory(userId, 10);
        context.history.userConversations = userConversations;
        console.log(`✅ Loaded ${userConversations.length} user conversations`);
      } catch (error) {
        console.log('⚠️  Using fallback for user conversations');
        context.history.userConversations = await fallbackMemory.getUserConversationHistory(userId, 10);
      }

      // Get channel context from PostgreSQL
      try {
        const channelContext = await getChannelConversationHistory(channelId, 20);
        context.history.channelContext = channelContext;
        console.log(`✅ Loaded ${channelContext.length} channel messages`);
      } catch (error) {
        console.log('⚠️  Using fallback for channel context');
        context.history.channelContext = await fallbackMemory.getChannelConversationHistory(channelId, 20);
      }

      // Get thread context if applicable
      if (threadId) {
        try {
          const threadContext = await getThreadHistory(threadId);
          context.history.threadContext = threadContext;
          console.log(`✅ Loaded ${threadContext.length} thread messages`);
        } catch (error) {
          console.log('⚠️  Using fallback for thread context');
          context.history.threadContext = await fallbackMemory.getThreadHistory(threadId);
        }
      }

      // Analyze patterns
      context.patterns = analyzePatterns(context.history.userConversations);

      // NEW: Get semantic context from Qdrant (optional)
      // This finds semantically similar past conversations for true context awareness
      if (params.currentMessage) {
        try {
          const semanticContext = await qdrant.getSemanticContext(
            params.currentMessage,
            userId,
            channelId,
            5
          );
          context.semanticContext = semanticContext;
          if (semanticContext.relevantPastInteractions) {
            console.log(`✅ Found ${semanticContext.userContext.length} similar past conversations`);
          }
        } catch (error) {
          console.log('ℹ️  Semantic search not available (Qdrant not configured)');
          context.semanticContext = {
            userContext: [],
            channelContext: [],
            relevantPastInteractions: false
          };
        }
      }
    }

    return context;
  } catch (error) {
    console.error('⚠️  Database not available, using file-based fallback for context');
    return fallbackMemory.buildContext(params);
  }
}

/**
 * Analyze user behavior patterns
 * Same as before but works with database data
 */
function analyzePatterns(conversations) {
  if (!conversations || conversations.length === 0) {
    return {
      totalInteractions: 0,
      avgResponseTime: null,
      commonIntents: [],
      preferredTimeOfDay: null,
      engagementLevel: 'unknown'
    };
  }

  const intents = {};
  const hoursActive = {};

  conversations.forEach(conv => {
    // Count intents
    if (conv.intent) {
      intents[conv.intent] = (intents[conv.intent] || 0) + 1;
    }

    // Track active hours
    hoursActive[conv.timeOfDay] = (hoursActive[conv.timeOfDay] || 0) + 1;
  });

  const commonIntents = Object.entries(intents)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([intent]) => intent);

  const mostActiveHour = Object.entries(hoursActive)
    .sort((a, b) => b[1] - a[1])[0]?.[0];

  return {
    totalInteractions: conversations.length,
    commonIntents,
    preferredTimeOfDay: mostActiveHour ? parseInt(mostActiveHour) : null,
    engagementLevel: conversations.length > 10 ? 'high' : conversations.length > 3 ? 'medium' : 'low',
    lastInteraction: conversations[conversations.length - 1]?.timestamp
  };
}

/**
 * Update context index for fast lookups
 */
async function updateContextIndex(entry) {
  const updates = [];

  // Update user index
  if (entry.userId) {
    updates.push(
      postgres.updateContextIndex('user', entry.userId, {
        userName: entry.userName,
        channels: [entry.channelId]
      })
    );
  }

  // Update channel index
  if (entry.channelId) {
    updates.push(
      postgres.updateContextIndex('channel', entry.channelId, {
        channelName: entry.channelName,
        users: [entry.userId]
      })
    );
  }

  // Update thread index
  if (entry.threadId) {
    updates.push(
      postgres.updateContextIndex('thread', entry.threadId, {
        channelId: entry.channelId,
        participants: [entry.userId]
      })
    );
  }

  await Promise.all(updates);
}

/**
 * Search conversations by query
 * Uses PostgreSQL full-text search + Qdrant semantic search
 */
async function searchConversations(query, limit = 10) {
  // Try semantic search first (more intelligent)
  try {
    const semanticResults = await qdrant.searchSimilarConversations(query, {}, limit);

    if (semanticResults.length > 0) {
      return semanticResults.map(result => ({
        timestamp: new Date(result.timestamp),
        messageId: result.message_id,
        userId: result.user_id,
        userName: result.user_name,
        channelName: result.channel_name,
        message: result.message_text,
        botResponse: result.bot_response,
        intent: result.intent,
        score: result.score
      }));
    }
  } catch (error) {
    console.error('⚠️  Semantic search failed, falling back to text search:', error);
  }

  // Fallback to PostgreSQL text search
  const rows = await postgres.searchConversations(query, limit);

  return rows.map(row => ({
    timestamp: row.timestamp,
    messageId: row.message_id,
    userId: row.user_id,
    userName: row.user_name,
    channelName: row.channel_name,
    message: row.message,
    botResponse: row.bot_response,
    intent: row.intent
  }));
}

/**
 * Get statistics about conversation memory
 */
async function getMemoryStats() {
  const postgresStats = await postgres.getMemoryStats();
  const qdrantInfo = await qdrant.getCollectionInfo();

  return {
    totalConversations: postgresStats.totalConversations,
    totalUsers: postgresStats.totalUsers,
    totalChannels: postgresStats.totalChannels,
    totalThreads: postgresStats.totalThreads,
    lastUpdated: postgresStats.newestConversation,
    oldestConversation: postgresStats.oldestConversation,
    newestConversation: postgresStats.newestConversation,
    vectorDatabase: qdrantInfo ? {
      totalVectors: qdrantInfo.pointsCount,
      indexedVectors: qdrantInfo.indexedVectorsCount,
      status: qdrantInfo.status
    } : null
  };
}

module.exports = {
  storeConversation,
  getUserConversationHistory,
  getChannelConversationHistory,
  getThreadHistory,
  buildContext,
  searchConversations,
  getMemoryStats,
  analyzePatterns
};
