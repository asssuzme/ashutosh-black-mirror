/**
 * Qdrant Vector Database Integration
 * Handles semantic search and conversation embeddings
 */

const { QdrantClient } = require('@qdrant/js-client-rest');
const OpenAI = require('openai');

let qdrantClient = null;
let openaiClient = null;

const COLLECTION_NAME = 'conversations';
const EMBEDDING_DIMENSIONS = 1536; // text-embedding-3-small

/**
 * Initialize Qdrant client
 */
function getQdrantClient() {
  if (!qdrantClient) {
    const qdrantUrl = process.env.QDRANT_URL || process.env.QDRANT_CLOUD_URL;

    if (!qdrantUrl) {
      console.log('⚠️  QDRANT_URL not configured - vector search disabled');
      return null;
    }

    const config = {
      url: qdrantUrl
    };

    // Add API key if using Qdrant Cloud
    if (process.env.QDRANT_API_KEY) {
      config.apiKey = process.env.QDRANT_API_KEY;
    }

    qdrantClient = new QdrantClient(config);
  }
  return qdrantClient;
}

/**
 * Initialize OpenAI client for embeddings
 */
function getOpenAIClient() {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openaiClient;
}

/**
 * Initialize Qdrant collection
 */
async function initializeCollection() {
  const client = getQdrantClient();

  if (!client) {
    console.log('ℹ️  Qdrant not configured - skipping vector database setup');
    return;
  }

  try {
    // Check if collection exists
    const collections = await client.getCollections();
    const exists = collections.collections.some(c => c.name === COLLECTION_NAME);

    if (exists) {
      console.log(`ℹ️  Qdrant collection "${COLLECTION_NAME}" already exists`);
      return;
    }

    // Create collection
    console.log(`📦 Creating Qdrant collection "${COLLECTION_NAME}"...`);
    await client.createCollection(COLLECTION_NAME, {
      vectors: {
        size: EMBEDDING_DIMENSIONS,
        distance: 'Cosine'
      },
      optimizers_config: {
        default_segment_number: 2
      },
      replication_factor: 1
    });

    // Create payload indexes for fast filtering
    console.log('🔍 Creating payload indexes...');
    await Promise.all([
      client.createPayloadIndex(COLLECTION_NAME, {
        field_name: 'channel_id',
        field_schema: 'keyword'
      }),
      client.createPayloadIndex(COLLECTION_NAME, {
        field_name: 'user_id',
        field_schema: 'keyword'
      }),
      client.createPayloadIndex(COLLECTION_NAME, {
        field_name: 'intern_id',
        field_schema: 'keyword'
      }),
      client.createPayloadIndex(COLLECTION_NAME, {
        field_name: 'timestamp',
        field_schema: 'integer'
      }),
      client.createPayloadIndex(COLLECTION_NAME, {
        field_name: 'intent',
        field_schema: 'keyword'
      })
    ]);

    console.log(`✅ Qdrant collection "${COLLECTION_NAME}" initialized`);
  } catch (error) {
    console.error('🔴 Failed to initialize Qdrant collection:', error);
    throw error;
  }
}

/**
 * Generate embedding for text using OpenAI
 */
async function generateEmbedding(text) {
  const openai = getOpenAIClient();

  try {
    const response = await openai.embeddings.create({
      model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      input: text,
      encoding_format: 'float'
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('🔴 Failed to generate embedding:', error);
    throw error;
  }
}

/**
 * Generate embeddings in batch (more efficient)
 */
async function generateEmbeddingsBatch(texts) {
  const openai = getOpenAIClient();

  try {
    const response = await openai.embeddings.create({
      model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      input: texts, // Can pass array of up to 2048 strings
      encoding_format: 'float'
    });

    return response.data.map(item => item.embedding);
  } catch (error) {
    console.error('🔴 Failed to generate batch embeddings:', error);
    throw error;
  }
}

/**
 * Store conversation embedding in Qdrant
 */
async function storeConversationEmbedding(conversationData) {
  const client = getQdrantClient();

  if (!client) {
    // Qdrant not configured - skip embedding storage
    return null;
  }

  const {
    messageId,
    threadId,
    channelId,
    channelName,
    userId,
    userName,
    internId,
    message,
    botResponse,
    intent,
    actionsTaken = [],
    timestamp,
    sentiment,
    tags = []
  } = conversationData;

  try {
    // Generate embedding for the message (optionally combine with bot response)
    const textToEmbed = botResponse
      ? `User: ${message}\nBot: ${botResponse}`
      : message;

    const embedding = await generateEmbedding(textToEmbed);

    // Store in Qdrant
    const point = {
      id: messageId, // Use message ID as point ID
      vector: embedding,
      payload: {
        message_id: messageId,
        thread_id: threadId || null,
        channel_id: channelId,
        channel_name: channelName || null,
        user_id: userId,
        user_name: userName,
        intern_id: internId || null,
        message_text: message,
        bot_response: botResponse || null,
        intent: intent || null,
        actions_taken: actionsTaken,
        timestamp: new Date(timestamp).getTime(), // Unix timestamp for filtering
        time_of_day: new Date(timestamp).getHours(),
        day_of_week: new Date(timestamp).getDay(),
        sentiment: sentiment || null,
        tags: tags
      }
    };

    await client.upsert(COLLECTION_NAME, {
      wait: true,
      points: [point]
    });

    console.log(`✅ Stored embedding for message ${messageId}`);
    return messageId;
  } catch (error) {
    console.error('🔴 Failed to store conversation embedding:', error);
    throw error;
  }
}

/**
 * Store multiple conversation embeddings in batch
 */
async function storeConversationEmbeddingsBatch(conversations) {
  const client = getQdrantClient();

  try {
    // Generate all embeddings in batch
    const textsToEmbed = conversations.map(conv => {
      return conv.botResponse
        ? `User: ${conv.message}\nBot: ${conv.botResponse}`
        : conv.message;
    });

    console.log(`📊 Generating ${textsToEmbed.length} embeddings in batch...`);
    const embeddings = await generateEmbeddingsBatch(textsToEmbed);

    // Create points for Qdrant
    const points = conversations.map((conv, idx) => ({
      id: conv.messageId,
      vector: embeddings[idx],
      payload: {
        message_id: conv.messageId,
        thread_id: conv.threadId || null,
        channel_id: conv.channelId,
        channel_name: conv.channelName || null,
        user_id: conv.userId,
        user_name: conv.userName,
        intern_id: conv.internId || null,
        message_text: conv.message,
        bot_response: conv.botResponse || null,
        intent: conv.intent || null,
        actions_taken: conv.actionsTaken || [],
        timestamp: new Date(conv.timestamp).getTime(),
        time_of_day: new Date(conv.timestamp).getHours(),
        day_of_week: new Date(conv.timestamp).getDay(),
        sentiment: conv.sentiment || null,
        tags: conv.tags || []
      }
    }));

    // Upsert all points
    await client.upsert(COLLECTION_NAME, {
      wait: true,
      points: points
    });

    console.log(`✅ Stored ${points.length} embeddings in batch`);
    return points.length;
  } catch (error) {
    console.error('🔴 Failed to store batch embeddings:', error);
    throw error;
  }
}

/**
 * Search for similar conversations
 */
async function searchSimilarConversations(queryText, filters = {}, limit = 5) {
  const client = getQdrantClient();

  try {
    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(queryText);

    // Build filter conditions
    const must = [];
    const mustNot = [];

    if (filters.userId) {
      must.push({ key: 'user_id', match: { value: filters.userId } });
    }

    if (filters.channelId) {
      must.push({ key: 'channel_id', match: { value: filters.channelId } });
    }

    if (filters.internId) {
      must.push({ key: 'intern_id', match: { value: filters.internId } });
    }

    if (filters.intent) {
      must.push({ key: 'intent', match: { value: filters.intent } });
    }

    if (filters.timeRangeHours) {
      const now = Date.now();
      const hoursAgo = now - (filters.timeRangeHours * 60 * 60 * 1000);
      must.push({
        key: 'timestamp',
        range: { gte: hoursAgo }
      });
    }

    if (filters.excludeUserId) {
      mustNot.push({ key: 'user_id', match: { value: filters.excludeUserId } });
    }

    // Search
    const searchResult = await client.search(COLLECTION_NAME, {
      vector: queryEmbedding,
      filter: must.length > 0 || mustNot.length > 0 ? { must, must_not: mustNot } : undefined,
      limit: limit,
      with_payload: true
    });

    return searchResult.map(result => ({
      score: result.score,
      ...result.payload
    }));
  } catch (error) {
    console.error('🔴 Failed to search similar conversations:', error);
    throw error;
  }
}

/**
 * Get conversation context from vector DB
 * Returns semantically similar past conversations for context
 */
async function getSemanticContext(messageText, userId, channelId, limit = 5) {
  const client = getQdrantClient();

  if (!client) {
    // Qdrant not available - return empty context
    return {
      userContext: [],
      channelContext: [],
      relevantPastInteractions: false
    };
  }

  try {
    // Search for similar conversations from this user
    const userContext = await searchSimilarConversations(
      messageText,
      { userId, timeRangeHours: 24 * 7 }, // Last week
      limit
    );

    // Search for similar conversations in this channel
    const channelContext = await searchSimilarConversations(
      messageText,
      { channelId, timeRangeHours: 24 }, // Last 24 hours
      3
    );

    return {
      userContext,
      channelContext,
      relevantPastInteractions: userContext.length > 0
    };
  } catch (error) {
    console.error('🔴 Failed to get semantic context:', error);
    return {
      userContext: [],
      channelContext: [],
      relevantPastInteractions: false
    };
  }
}

/**
 * Delete conversation embedding
 */
async function deleteConversationEmbedding(messageId) {
  const client = getQdrantClient();

  try {
    await client.delete(COLLECTION_NAME, {
      wait: true,
      points: [messageId]
    });

    console.log(`🗑️  Deleted embedding for message ${messageId}`);
  } catch (error) {
    console.error('🔴 Failed to delete embedding:', error);
    throw error;
  }
}

/**
 * Get Qdrant collection info and stats
 */
async function getCollectionInfo() {
  const client = getQdrantClient();

  try {
    const info = await client.getCollection(COLLECTION_NAME);
    return {
      vectorsCount: info.vectors_count,
      indexedVectorsCount: info.indexed_vectors_count,
      pointsCount: info.points_count,
      status: info.status
    };
  } catch (error) {
    console.error('🔴 Failed to get collection info:', error);
    return null;
  }
}

module.exports = {
  initializeCollection,
  generateEmbedding,
  generateEmbeddingsBatch,
  storeConversationEmbedding,
  storeConversationEmbeddingsBatch,
  searchSimilarConversations,
  getSemanticContext,
  deleteConversationEmbedding,
  getCollectionInfo,
  getQdrantClient
};
