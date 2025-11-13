# Vector Database Configuration for AI Boss 2.0

## Purpose
Store conversation embeddings for semantic search and contextual understanding.
Enables AI to find similar conversations, detect patterns, and provide truly context-aware responses.

## Database Choice: Qdrant

**Why Qdrant:**
- Open-source, can be self-hosted
- Excellent performance for semantic search
- Native support for OpenAI embeddings
- Built-in filtering capabilities
- REST API and Python/Node.js clients
- Can run in Docker for easy deployment

**Alternatives considered:**
- Pinecone: Cloud-only, costs money at scale
- Weaviate: More complex setup
- ChromaDB: Good for local, but Qdrant has better production features

## Collection Schema

### Collection: `conversations`

**Vector Dimensions:** 1536 (OpenAI text-embedding-3-small produces 1536-dim vectors)

**Payload Schema:**
```json
{
  "message_id": "string",          // Slack message ID
  "thread_id": "string | null",    // Thread ID if in thread
  "channel_id": "string",          // Slack channel ID
  "channel_name": "string",        // Human-readable channel name
  "user_id": "string",             // Slack user ID
  "user_name": "string",           // User's display name
  "intern_id": "string | null",    // UUID from PostgreSQL if intern
  "message_text": "string",        // Full message text
  "bot_response": "string | null", // Bot's response if any
  "intent": "string | null",       // Detected intent
  "actions_taken": ["string"],     // List of actions
  "timestamp": "number",           // Unix timestamp
  "time_of_day": "number",         // Hour (0-23)
  "day_of_week": "number",         // Day (0-6)
  "sentiment": "string | null",    // positive/neutral/negative
  "tags": ["string"]               // Arbitrary tags
}
```

**Indexes:**
- `channel_id`: For filtering by channel
- `user_id`: For filtering by user
- `intern_id`: For filtering by intern
- `timestamp`: For time-based filtering
- `intent`: For finding similar intents

## Embedding Strategy

### What to embed:
1. **User messages** - Full text of every message received
2. **Bot responses** - To understand what we said before
3. **Combined context** - User message + bot response as one embedding for full turn

### Embedding Model:
- **OpenAI text-embedding-3-small**
  - Cost-effective: $0.02 per 1M tokens
  - Fast: <100ms per embedding
  - Quality: Excellent for conversation understanding
  - Dimensions: 1536

### When to embed:
- **Real-time**: As soon as conversation is stored
- **Batch**: Can re-embed historical data during migration

## Search Strategies

### 1. Semantic Similarity Search
Find conversations similar to current message to understand context.

```javascript
// Example: User says "I'm stuck on this task"
// Search for similar past conversations where user needed help
const results = await qdrant.search({
  collection_name: "conversations",
  vector: await embedMessage("I'm stuck on this task"),
  filter: {
    must: [
      { key: "user_id", match: { value: currentUserId } }
    ]
  },
  limit: 5
});
```

### 2. Intent-Based Retrieval
Find all past instances of specific intents (check-in, task completion, help request).

```javascript
const results = await qdrant.search({
  collection_name: "conversations",
  vector: await embedMessage("checking in for the day"),
  filter: {
    must: [
      { key: "intent", match: { value: "check_in" } }
    ]
  },
  limit: 10
});
```

### 3. Temporal Context Search
Find recent conversations in the same channel/thread.

```javascript
const results = await qdrant.search({
  collection_name: "conversations",
  vector: currentMessageEmbedding,
  filter: {
    must: [
      { key: "channel_id", match: { value: channelId } },
      {
        key: "timestamp",
        range: {
          gte: Date.now() - (24 * 60 * 60 * 1000) // Last 24 hours
        }
      }
    ]
  },
  limit: 20
});
```

### 4. Cross-User Pattern Detection
Find how other interns handled similar situations.

```javascript
const results = await qdrant.search({
  collection_name: "conversations",
  vector: await embedMessage("I need help with cold calling"),
  filter: {
    must: [
      { key: "intern_id", match: { any: allInternIds } }
    ],
    must_not: [
      { key: "user_id", match: { value: currentUserId } }
    ]
  },
  limit: 5
});
```

## Qdrant Setup

### Docker Compose Configuration

```yaml
version: '3.8'
services:
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"  # REST API
      - "6334:6334"  # gRPC API
    volumes:
      - ./qdrant_storage:/qdrant/storage
    environment:
      - QDRANT_ALLOW_RECOVERY_MODE=true
    restart: unless-stopped
```

### Initialize Collection

```javascript
const { QdrantClient } = require('@qdrant/js-client-rest');

const client = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333'
});

async function initializeVectorDB() {
  // Create collection if it doesn't exist
  await client.createCollection('conversations', {
    vectors: {
      size: 1536,
      distance: 'Cosine'
    },
    optimizers_config: {
      default_segment_number: 2
    },
    replication_factor: 1
  });

  // Create indexes for fast filtering
  await client.createPayloadIndex('conversations', {
    field_name: 'channel_id',
    field_schema: 'keyword'
  });

  await client.createPayloadIndex('conversations', {
    field_name: 'user_id',
    field_schema: 'keyword'
  });

  await client.createPayloadIndex('conversations', {
    field_name: 'timestamp',
    field_schema: 'integer'
  });

  console.log('✅ Qdrant collection initialized');
}
```

## Integration with PostgreSQL

**Dual storage strategy:**
1. **PostgreSQL**: Structured data, relational queries, stats, aggregations
2. **Qdrant**: Semantic search, pattern detection, contextual retrieval

**Link via IDs:**
- PostgreSQL conversations table has `embedding_id` field
- Qdrant payload has `message_id` pointing back to PostgreSQL
- Both have `intern_id` for cross-referencing

**Query flow:**
1. New message arrives
2. Store in PostgreSQL (structured data)
3. Generate embedding via OpenAI
4. Store embedding in Qdrant with metadata
5. When AI needs context:
   - Query Qdrant for semantically similar messages
   - Get `message_id` from results
   - Optionally query PostgreSQL for full structured data

## Performance Considerations

**Embedding Generation:**
- Batch when possible (up to 2048 embeddings per API call)
- Cache common phrases/intents
- Async processing to avoid blocking

**Search Performance:**
- Qdrant is highly optimized, sub-100ms for most queries
- Use filters to reduce search space
- Limit results to what's needed (5-20 usually sufficient)

**Storage:**
- 1536-dim float32 vector = ~6KB per message
- 1M messages = ~6GB vector storage
- PostgreSQL text storage much smaller
- Total: Very manageable

## Environment Variables

Add to `.env`:
```bash
# Vector Database
QDRANT_URL=http://localhost:6333
QDRANT_ENABLED=true

# Embeddings
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
```

## Migration Plan

1. **Start fresh**: Initialize Qdrant collection
2. **Migrate existing data**:
   - Read all conversations from PostgreSQL
   - Generate embeddings in batches (100 at a time)
   - Insert into Qdrant with proper metadata
3. **Enable real-time sync**: Every new conversation → both DBs
4. **Validate**: Run test queries to ensure semantic search works
