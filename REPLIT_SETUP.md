# AI Boss 2.0 - Replit Setup Guide

**Pure AI Mode - No Keyword Detection**

This guide is specifically for running AI Boss 2.0 on Replit with its built-in PostgreSQL database.

## Quick Setup (5 minutes)

### 1. Enable PostgreSQL in Replit

1. In your Replit project, go to **Tools** → **Database**
2. Click **"Enable PostgreSQL"**
3. Replit automatically sets `DATABASE_URL` environment variable
4. ✅ Done! No Docker or manual setup needed

### 2. Install Dependencies

Already done! Your `package.json` has been updated with:
- `pg` - PostgreSQL client
- `@qdrant/js-client-rest` - Vector database (optional)

Just run:
```bash
npm install
```

### 3. Setup Database Schema

```bash
node database/setup-replit.js
```

This creates all necessary tables:
- interns (team members)
- conversations (full message history)
- attendance (daily check-ins)
- tasks (assignments and completions)
- And more...

### 4. Migrate Existing Data (Optional)

If you have existing data in `memory/` folder:

```bash
node database/migrate.js
```

This moves all your:
- Interns from `memory/interns.json`
- Conversations from `memory/conversations.jsonl`
- Attendance and task history

### 5. Start the Bot

```bash
npm start
```

## What Changed?

### ✅ Files Replaced

I've already replaced these files with V2 (pure AI) versions:
- ✅ `index.js` → Pure AI, NO keyword detection
- ✅ `utils/aiDecisionEngine.js` → Context-aware AI decisions
- ✅ `utils/conversationMemory.js` → Database-backed memory

Old versions backed up as:
- `index-v1-backup.js`
- `utils/aiDecisionEngine-v1-backup.js`
- `utils/conversationMemory-v1-backup.js`

### 🗑️ Removed

- ❌ All keyword detection (`check in`, `tell boss`, etc.)
- ❌ Pattern matching for commands
- ❌ Hardcoded shortcuts
- ❌ File-based JSONL storage

### 🧠 Added

- ✅ Pure AI analysis of every message
- ✅ Full conversation history context
- ✅ PostgreSQL database
- ✅ Smart intent understanding

## Environment Variables

Your `.env` file should have:

```bash
# Slack (already configured)
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
OPENAI_API_KEY=sk-...
ADMIN_USER_ID=U...

# Database (Replit provides this automatically)
# DATABASE_URL=postgresql://... (automatically set by Replit)

# Optional: Vector Database (for semantic search)
# If you want even smarter context awareness:
# QDRANT_CLOUD_URL=https://your-cluster.qdrant.io
# QDRANT_API_KEY=your_key
```

**Note:** You don't need to set `DATABASE_URL` manually - Replit does this automatically when you enable PostgreSQL!

## Optional: Add Vector Database

For even better context awareness (semantic search):

1. Sign up for [Qdrant Cloud](https://cloud.qdrant.io/) - FREE tier available
2. Create a cluster (takes 1 minute)
3. Add to `.env`:
   ```bash
   QDRANT_CLOUD_URL=https://your-cluster.qdrant.io
   QDRANT_API_KEY=your_api_key_here
   ```

Without Qdrant, the bot still works great - it just won't have semantic similarity search for past conversations.

## How It Works Now

### Before (V1 - Keyword Detection):
```
User: "check in"
Bot: IF text contains "check in" → mark attendance
```

**Problem:** Only works with exact phrases. Breaks easily.

### After (V2 - Pure AI):
```
User: "here"
AI:
  - Analyzes: It's 9 AM
  - Checks: User has no attendance today
  - Reviews: Past behavior shows morning check-ins
  - Understands: Full conversation context
  - Decides: This is a check-in → mark attendance
```

**Result:** Understands natural language and context.

## Testing

Try these messages in Slack (without old keywords):

**Check-ins:**
- "here"
- "present"
- "arrived"
- Just "good morning" (first message of day)

**Boss messages:**
- "tell him I'm taking off"
- "inform him about the delay"
- "can you let him know"

**Questions:**
- "why aren't you replying"
- "are you there"
- "hello?"

AI will understand from **context**, not keywords!

## Database Structure

Your PostgreSQL database now has:

```
interns
├── id (UUID)
├── slack_id
├── name
├── role
├── channel_id
├── stats (tasks, attendance, etc.)
└── timestamps

conversations
├── id (UUID)
├── message_id
├── user_id
├── message text
├── bot_response
├── ai_decision (full JSON)
├── intent
├── actions_taken
└── timestamp

attendance
├── intern_id
├── date
├── login_time
├── is_late
└── late_by_minutes

tasks
├── id
├── intern_id
├── title
├── status
├── completed
└── timestamps
```

## Checking Database

You can query your database directly in Replit:

1. Go to **Tools** → **Database**
2. Click **SQL Console**
3. Run queries like:

```sql
-- See all conversations
SELECT user_name, message, bot_response, timestamp
FROM conversations
ORDER BY timestamp DESC
LIMIT 10;

-- Check attendance
SELECT i.name, a.date, a.login_time, a.is_late
FROM attendance a
JOIN interns i ON a.intern_id = i.id
ORDER BY a.date DESC;

-- View AI decisions
SELECT message, ai_decision->>'reasoning' as reasoning
FROM conversations
WHERE ai_decision IS NOT NULL
LIMIT 5;
```

## Troubleshooting

### "DATABASE_URL not found"

**Solution:** Enable PostgreSQL in Replit
1. Tools → Database
2. Enable PostgreSQL
3. Restart your Repl

### "Connection refused"

**Solution:** PostgreSQL might not be started
1. Stop the bot (Ctrl+C)
2. Wait 10 seconds
3. Start again: `npm start`

### Bot still using keywords

**Solution:** Make sure you're running the new version
```bash
# Check which version is running
head -20 index.js

# Should see: "Pure AI-driven version - NO keyword detection shortcuts"
# If not, the file wasn't replaced properly
```

### AI not responding correctly

**Solution:** Check the logs for AI reasoning
```bash
# You'll see logs like:
# 🧠 AI Decision: {
#   shouldRespond: true,
#   reasoning: "User said 'here' at 9 AM, no attendance today...",
#   action: "login"
# }
```

## Costs

- **Replit PostgreSQL**: FREE (included in Repl)
- **OpenAI API**: ~$0.0006 per message
- **Qdrant Cloud** (optional): FREE tier available

For 10,000 messages/month: **~$6-8/month** (just OpenAI)

## Rollback

If you need to revert to the old version:

```bash
cp index-v1-backup.js index.js
cp utils/aiDecisionEngine-v1-backup.js utils/aiDecisionEngine.js
cp utils/conversationMemory-v1-backup.js utils/conversationMemory.js
npm start
```

## Benefits of New Architecture

1. **Smarter**: Understands intent, not just keywords
2. **Context-aware**: Knows conversation history
3. **Adaptive**: Learns patterns automatically
4. **Scalable**: Real database handles growth
5. **Maintainable**: No more adding keywords for every variation

## Next Steps

After setup:
1. ✅ Test with natural language messages
2. ✅ Monitor AI decision logs
3. ✅ Optionally add Qdrant for semantic search
4. ✅ Watch it learn and improve over time

---

**The bot is now PURE AI - no shortcuts, just intelligence!** 🧠✨
