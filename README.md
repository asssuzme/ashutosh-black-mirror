# 🤖 AI Boss 2.0 - Self-Learning Slack Manager

A next-generation AI-powered Slack bot that manages intern teams with context awareness, continuous learning, and intelligent automation. Think of it as your digital team manager that gets smarter every day.

## 🎯 Overview

AI Boss 2.0 is not just a scheduler—it's a **self-learning manager** that:

- ✅ Understands **who's speaking to whom** (you vs. interns vs. the bot itself)
- 🧠 **Differentiates context**: human-to-boss vs. command-to-bot
- 📚 **Continuously learns** from every message, summary, and interaction
- 🎛️ Provides a **private control panel** (DM) for real-time configuration
- 📊 Automates attendance, task assignment, progress tracking, and performance reviews
- 🚀 Evolves its management style based on team performance data

## ✨ Core Features

### 1. **Context Awareness**
The bot intelligently classifies every message:
- `INTERN_TO_BOSS` - When interns mention or reply to you
- `INTERN_TO_BOT` - Commands directed at the bot (`/login`, `/progress`, etc.)
- `ADMIN_DIRECTIVE` - Your commands in the private DM
- `GENERAL_CHAT` - Team conversations (logged for learning)

### 2. **Daily Automation**
Automated schedule (Asia/Kolkata timezone):
- **9:00 AM** - Send AI-generated daily tasks
- **10:00 AM** - Check attendance, send reminders to missing interns
- **1:00 PM** - Progress check-in ping
- **6:00 PM** - End-of-day task collection
- **6:30 PM** - Performance digest to admin
- **10:00 PM** - Nightly learning job

### 3. **Self-Learning System**
- Maintains rolling context for each intern (attendance, sentiment, completion rate)
- Nightly AI analysis of performance patterns
- Automatically adjusts task difficulty and management tone
- Builds intern "profile vectors" (strengths, weaknesses, optimal workload)

### 4. **Admin Control DM**
Private channel with you for real-time control:
```
add intern [name] [role]          - Add new intern to system
remove intern [name]               - Remove intern
update tone [stricter/friendly]    - Adjust bot communication style
upload data                        - Feed context or new information
stats                              - Get current performance snapshot
```

### 5. **AI-Powered Features**
Uses OpenAI GPT-4 for:
- Dynamic task generation based on role and performance
- Progress update sentiment analysis
- Daily and weekly performance summaries
- Continuous learning and strategy improvement

### 6. **Weekly Analytics**
- **Sunday 7 PM** - Comprehensive weekly performance review
- **Friday 6 PM** - Top 3 performer leaderboard

## 🏗️ Architecture

```
/ai-boss-2.0
├── index.js                    # Main bot and cron jobs
├── package.json                # Dependencies
├── .env.example                # Environment template
├── tasks.json                  # Example task templates
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

## 🚀 Setup Instructions

### Prerequisites
- Node.js 18+ installed
- Slack workspace with admin access
- OpenAI API account

### Step 1: Clone & Install

```bash
git clone <your-repo-url>
cd ashutosh-black-mirror
npm install
```

### Step 2: Create Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **"Create New App"** → **"From scratch"**
3. Name it "AI Boss" and select your workspace

#### Configure App Permissions (OAuth & Permissions):
Add these **Bot Token Scopes**:
- `app_mentions:read`
- `channels:history`
- `channels:read`
- `chat:write`
- `im:history`
- `im:read`
- `im:write`
- `users:read`
- `reactions:write`

#### Enable Socket Mode:
1. Go to **Socket Mode** in sidebar
2. Enable Socket Mode
3. Generate an **App-Level Token** with `connections:write` scope
4. Save this token (starts with `xapp-`)

#### Enable Event Subscriptions:
Subscribe to these bot events:
- `message.channels`
- `message.im`
- `app_mention`

#### Install App to Workspace:
1. Go to **Install App** in sidebar
2. Click **"Install to Workspace"**
3. Authorize the app
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

### Step 3: Get Your User ID

1. Open Slack, click your profile
2. Click **"Profile"** → **"More"** → **"Copy member ID"**
3. This is your `ADMIN_USER_ID`

### Step 4: Get Channel IDs

For each team channel (#sales, #outreach, #shitposters):
1. Open the channel in Slack
2. Click channel name → scroll down
3. Copy the Channel ID at the bottom

### Step 5: Configure Environment

Create `.env` file from template:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-token

OPENAI_API_KEY=sk-your-openai-key

ADMIN_USER_ID=U01234567890
ADMIN_DM_CHANNEL_ID=D01234567890

SALES_CHANNEL_ID=C01234567890
OUTREACH_CHANNEL_ID=C01234567891
SHITPOSTERS_CHANNEL_ID=C01234567892

TIMEZONE=Asia/Kolkata
LEARNING_ENABLED=true
```

### Step 6: Run the Bot

```bash
npm start
```

You should see:
```
⚡️ AI Boss 2.0 is running!
🤖 AI Boss 2.0 initialized
Bot User ID: U...
Admin User ID: U...
⏰ Setting up cron jobs...
✅ All cron jobs scheduled
```

The bot will DM you: "✅ AI Boss 2.0 is online and ready to manage your teams!"

## 📖 Usage Guide

### For Interns

**Login/Attendance:**
```
/login
```
Or just say: `"here"` or `"logged in"`

**View Tasks:**
```
/tasks
```
Or ask: `"What should I do today?"`

**Submit Progress:**
```
/progress Completed 15 cold calls, 3 qualified leads
```
Or naturally: `"I finished the email campaign"`

**Mark Complete:**
```
/done
```

**Check Status:**
```
/status
```

**Get Help:**
```
/help
```

### For Admin (You)

In your private DM with the bot:

**Add Intern:**
```
add intern john sales
add intern sarah outreach
```

**Remove Intern:**
```
remove intern john
```

**Update Bot Tone:**
```
update tone stricter
update tone friendly
```

**Upload Context/Data:**
```
upload data We're pivoting focus to enterprise clients this month
```
Or just paste information—the bot will integrate it into memory.

**Get Current Stats:**
```
stats
```

**General Directives:**
Just talk naturally:
```
Focus more on quality over quantity this week
Interns need to submit at least 3 progress updates daily
```

## 🧠 How Learning Works

### Nightly Learning Job (10 PM IST)

Every night, the bot:
1. Analyzes last 30 days of performance data
2. Identifies patterns (best task types, optimal workload, common failures)
3. Builds/updates intern profiles:
   - Strengths & weaknesses
   - Optimal task count
   - Preferred motivation style
4. Adjusts future task generation and tone automatically

### Continuous Context Building

The bot learns from:
- ✅ Attendance patterns
- ✅ Progress update quality and sentiment
- ✅ Task completion rates
- ✅ Response times
- ✅ Your admin directives
- ✅ General team chat (contextually)

This data feeds into:
- Personalized task generation
- Adaptive communication tone
- Performance predictions
- Proactive intervention

## 🎨 Customization

### Modify Task Templates

Edit `tasks.json` to customize default tasks per role:

```json
{
  "sales": [
    {
      "title": "Your custom task",
      "description": "Detailed description",
      "priority": "high",
      "estimatedTime": "60"
    }
  ]
}
```

### Adjust Automation Schedule

Edit cron expressions in `memory/rules.json`:

```json
{
  "automationSchedule": {
    "dailyTasks": "0 9 * * *",
    "loginCheck": "0 10 * * *"
  }
}
```

### Change Bot Personality

Update `memory/rules.json`:

```json
{
  "tone": "professional",  // professional | friendly | firm | motivating
  "rules": [
    "Your custom rule here"
  ]
}
```

## 📊 Performance Metrics Tracked

**Per Intern:**
- Attendance rate
- Task completion rate
- Average quality score (from AI analysis)
- Response time
- Progress update frequency

**Team-Wide:**
- Overall attendance
- Total tasks completed
- Average quality
- Role-based performance comparison

## 🔧 Troubleshooting

**Bot not responding:**
- Check `.env` file has correct tokens
- Verify Socket Mode is enabled
- Ensure bot is invited to channels

**Commands not working:**
- Make sure you're using slash commands (`/login`) or natural language
- Check bot has necessary permissions
- Review logs: `node index.js`

**Learning not working:**
- Verify `OPENAI_API_KEY` is valid
- Check OpenAI API credits
- Review console for error messages during nightly job

**Timezone issues:**
- Confirm `TIMEZONE=Asia/Kolkata` in `.env`
- Cron jobs respect this timezone setting

## 🛡️ Security Notes

- ✅ Never commit `.env` file to git
- ✅ Keep API keys secure
- ✅ Only admin (your Slack ID) can issue directives
- ✅ All memory stored locally in JSON files
- ✅ Optional: Migrate to SQLite by setting `USE_DATABASE=true`

## 🚧 Future Enhancements

- [ ] Slash command: `/aiboss stats` for quick metrics
- [ ] Export memory as JSON endpoint
- [ ] Multi-language support
- [ ] Webhook integration for external tools
- [ ] Advanced analytics dashboard
- [ ] Custom rewards/gamification system

## 📝 Example Workflow

**9:00 AM** - Bot sends personalized tasks to each intern based on their profile and recent performance

**9:30 AM** - Intern "Sarah" types `/login` → Bot marks attendance and confirms

**1:00 PM** - Bot pings interns without progress updates

**1:15 PM** - Sarah: `"progress: sent 40 outreach emails, 5 responses"` → Bot analyzes sentiment and quality, responds with encouragement

**6:00 PM** - Bot reminds interns to complete final tasks

**6:30 PM** - You receive detailed performance summary:
```
📊 Daily Performance Summary

Overall Performance: Strong day with 85% attendance
Top Performers:
• Sarah (outreach) - 100% task completion, excellent quality
• John (sales) - 90% completion, needs follow-up on CRM updates

Concerns:
• Mike (shitposters) - No login today

Recommended Actions:
• Check in with Mike tomorrow morning
• Consider increasing Sarah's task difficulty
```

**10:00 PM** - Learning job runs, updates Sarah's profile: `"High performer, can handle heavier workload, prefers data-driven feedback"`

**Next Day 9:00 AM** - Sarah receives slightly more challenging tasks based on yesterday's success

## 🤝 Contributing

This is a custom internal tool, but suggestions welcome! Open an issue or submit a PR.

## 📄 License

MIT License - Feel free to modify and adapt for your team.

---

Built with ❤️ using Node.js, Slack Bolt, and OpenAI GPT-4

**Ready to crush team management? Let AI Boss 2.0 handle it.** 🚀
