/**
 * Conversation Memory System
 * Stores ALL interactions for context-aware AI decision making
 *
 * Architecture:
 * - Stores every message with full context
 * - Maintains thread relationships
 * - Tracks user behavior patterns
 * - Enables semantic retrieval
 * - Supports learning over time
 */

const fs = require('fs').promises;
const path = require('path');

const MEMORY_DIR = path.join(__dirname, '..', 'memory');
const CONVERSATIONS_FILE = path.join(MEMORY_DIR, 'conversations.jsonl');
const CONTEXT_INDEX_FILE = path.join(MEMORY_DIR, 'context_index.json');

/**
 * Store a conversation turn (message + bot response)
 */
async function storeConversation(data) {
  const entry = {
    timestamp: new Date().toISOString(),
    messageId: data.messageId || data.ts,
    threadId: data.threadId || data.thread_ts || null,
    channelId: data.channelId,
    channelName: data.channelName || null,
    userId: data.userId,
    userName: data.userName,
    userRole: data.userRole || null,

    // Message content
    message: data.message,
    messageType: data.messageType || 'text', // text, file, reaction, etc

    // Bot analysis
    intent: data.intent || null,
    aiDecision: data.aiDecision || null,
    botResponse: data.botResponse || null,
    actionsTaken: data.actionsTaken || [],

    // Context
    timeOfDay: new Date().getHours(),
    dayOfWeek: new Date().getDay(),
    isFirstMessageOfDay: data.isFirstMessageOfDay || false,

    // Metadata
    sentiment: data.sentiment || null,
    urgency: data.urgency || null,
    tags: data.tags || []
  };

  // Append to JSONL file (one line per conversation)
  await fs.appendFile(CONVERSATIONS_FILE, JSON.stringify(entry) + '\n');

  // Update context index
  await updateContextIndex(entry);

  return entry;
}

/**
 * Get recent conversation history for a user
 */
async function getUserConversationHistory(userId, limit = 20) {
  try {
    const content = await fs.readFile(CONVERSATIONS_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(line => line);

    const userConversations = [];

    // Read from end (most recent first)
    for (let i = lines.length - 1; i >= 0 && userConversations.length < limit; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.userId === userId) {
          userConversations.push(entry);
        }
      } catch (e) {
        // Skip malformed lines
        continue;
      }
    }

    return userConversations.reverse(); // Return chronological order
  } catch (error) {
    if (error.code === 'ENOENT') {
      return []; // File doesn't exist yet
    }
    throw error;
  }
}

/**
 * Get conversation history for a specific channel
 */
async function getChannelConversationHistory(channelId, limit = 50) {
  try {
    const content = await fs.readFile(CONVERSATIONS_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(line => line);

    const channelConversations = [];

    for (let i = lines.length - 1; i >= 0 && channelConversations.length < limit; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.channelId === channelId) {
          channelConversations.push(entry);
        }
      } catch (e) {
        continue;
      }
    }

    return channelConversations.reverse();
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Get thread conversation history
 */
async function getThreadHistory(threadId) {
  try {
    const content = await fs.readFile(CONVERSATIONS_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(line => line);

    const threadMessages = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.threadId === threadId || entry.messageId === threadId) {
          threadMessages.push(entry);
        }
      } catch (e) {
        continue;
      }
    }

    return threadMessages;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Build rich context for AI decision making
 */
async function buildContext(params) {
  const { userId, channelId, threadId, includeHistory = true } = params;

  const context = {
    timestamp: new Date().toISOString(),
    userId,
    channelId,
    threadId,
    history: {}
  };

  if (includeHistory) {
    // Get user's recent conversations
    context.history.userConversations = await getUserConversationHistory(userId, 10);

    // Get channel context
    context.history.channelContext = await getChannelConversationHistory(channelId, 20);

    // Get thread context if applicable
    if (threadId) {
      context.history.threadContext = await getThreadHistory(threadId);
    }

    // Analyze patterns
    context.patterns = analyzePatterns(context.history.userConversations);
  }

  return context;
}

/**
 * Analyze user behavior patterns
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
  let index = {};

  try {
    const content = await fs.readFile(CONTEXT_INDEX_FILE, 'utf8');
    index = JSON.parse(content);
  } catch (error) {
    // File doesn't exist or is malformed, start fresh
    index = {
      users: {},
      channels: {},
      threads: {},
      lastUpdated: null
    };
  }

  // Update user index
  if (!index.users[entry.userId]) {
    index.users[entry.userId] = {
      userName: entry.userName,
      totalMessages: 0,
      lastSeen: null,
      channels: []
    };
  }

  index.users[entry.userId].totalMessages++;
  index.users[entry.userId].lastSeen = entry.timestamp;

  if (!index.users[entry.userId].channels.includes(entry.channelId)) {
    index.users[entry.userId].channels.push(entry.channelId);
  }

  // Update channel index
  if (!index.channels[entry.channelId]) {
    index.channels[entry.channelId] = {
      channelName: entry.channelName,
      totalMessages: 0,
      activeUsers: []
    };
  }

  index.channels[entry.channelId].totalMessages++;

  if (!index.channels[entry.channelId].activeUsers.includes(entry.userId)) {
    index.channels[entry.channelId].activeUsers.push(entry.userId);
  }

  // Update thread index
  if (entry.threadId) {
    if (!index.threads[entry.threadId]) {
      index.threads[entry.threadId] = {
        channelId: entry.channelId,
        participants: [],
        messageCount: 0
      };
    }

    index.threads[entry.threadId].messageCount++;

    if (!index.threads[entry.threadId].participants.includes(entry.userId)) {
      index.threads[entry.threadId].participants.push(entry.userId);
    }
  }

  index.lastUpdated = entry.timestamp;

  // Write back to file
  await fs.writeFile(CONTEXT_INDEX_FILE, JSON.stringify(index, null, 2));
}

/**
 * Search conversations by query (simple text search for now)
 * Can be upgraded to vector search later
 */
async function searchConversations(query, limit = 10) {
  try {
    const content = await fs.readFile(CONVERSATIONS_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(line => line);

    const results = [];
    const queryLower = query.toLowerCase();

    for (let i = lines.length - 1; i >= 0 && results.length < limit; i--) {
      try {
        const entry = JSON.parse(lines[i]);

        if (entry.message.toLowerCase().includes(queryLower) ||
            (entry.botResponse && entry.botResponse.toLowerCase().includes(queryLower))) {
          results.push(entry);
        }
      } catch (e) {
        continue;
      }
    }

    return results;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Get statistics about conversation memory
 */
async function getMemoryStats() {
  try {
    const [conversationContent, indexContent] = await Promise.all([
      fs.readFile(CONVERSATIONS_FILE, 'utf8'),
      fs.readFile(CONTEXT_INDEX_FILE, 'utf8')
    ]);

    const lines = conversationContent.trim().split('\n').filter(line => line);
    const index = JSON.parse(indexContent);

    return {
      totalConversations: lines.length,
      totalUsers: Object.keys(index.users || {}).length,
      totalChannels: Object.keys(index.channels || {}).length,
      totalThreads: Object.keys(index.threads || {}).length,
      lastUpdated: index.lastUpdated,
      oldestConversation: lines.length > 0 ? JSON.parse(lines[0]).timestamp : null,
      newestConversation: lines.length > 0 ? JSON.parse(lines[lines.length - 1]).timestamp : null
    };
  } catch (error) {
    return {
      totalConversations: 0,
      totalUsers: 0,
      totalChannels: 0,
      totalThreads: 0,
      lastUpdated: null,
      oldestConversation: null,
      newestConversation: null
    };
  }
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
