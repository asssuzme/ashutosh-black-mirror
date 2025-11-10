# AI Boss 2.0 - Replit Configuration

## Project Overview
AI Boss 2.0 is a self-learning Slack bot that manages intern teams with context awareness, continuous learning, and intelligent automation. It acts as a digital team manager that gets smarter every day.

## Architecture
- **Type**: Backend-only Slack bot (no frontend)
- **Runtime**: Node.js 18+
- **Framework**: Slack Bolt SDK (Socket Mode)
- **AI**: OpenAI GPT-4
- **Storage**: JSON files (optional SQLite)
- **Scheduling**: node-cron for automated tasks

## Key Features
- Context-aware message classification
- Daily automation (task assignment, attendance, progress tracking)
- Self-learning system with nightly AI analysis
- Admin control via DM
- Performance analytics and reporting

## Project Structure
```
/ai-boss-2.0
├── index.js                    # Main bot and cron jobs
├── utils/
│   ├── contextClassifier.js    # Message intent classification
│   ├── openaiHelper.js         # AI reasoning and generation
│   ├── slackHelper.js          # Slack API utilities
│   └── memoryManager.js        # JSON storage management
└── memory/
    ├── interns.json            # Intern profiles and history
    ├── rules.json              # Bot configuration and rules
    └── summaries.json          # Daily/weekly summaries + learning data
```

## Environment Setup
This bot requires several API keys and Slack tokens to function:

### Required Secrets
- `SLACK_BOT_TOKEN` - Slack Bot User OAuth Token (xoxb-...)
- `SLACK_SIGNING_SECRET` - Slack app signing secret
- `SLACK_APP_TOKEN` - Slack App-Level Token for Socket Mode (xapp-...)
- `OPENAI_API_KEY` - OpenAI API key for AI features
- `ADMIN_USER_ID` - Slack User ID of the admin/manager

### Optional Configuration
- `ADMIN_DM_CHANNEL_ID` - Direct message channel ID with admin
- `SALES_CHANNEL_ID` - Sales team channel ID
- `OUTREACH_CHANNEL_ID` - Outreach team channel ID
- `SHITPOSTERS_CHANNEL_ID` - Content team channel ID
- `TIMEZONE` - Timezone for cron jobs (default: Asia/Kolkata)
- `LEARNING_ENABLED` - Enable nightly learning (default: true)

## Deployment Notes
- Bot runs continuously via Socket Mode (no webhook URL needed)
- Health check endpoint available at `/health`
- Runs on port 3000 by default
- Uses localhost (backend only)

## Recent Changes
- 2025-11-10: Initial import and Replit configuration
