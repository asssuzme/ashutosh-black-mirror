# AI Boss 2.0 - Deployment Guide

## 🚀 Quick Start (Replit)

### 1. Pull Latest Code
```bash
git pull
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Database (First Time Only)
```bash
# Enable PostgreSQL in Replit (Tools → Database)
node database/setup-replit.js
```

### 4. Start the Bot
```bash
npm start
```

That's it! The bot is now fully autonomous. ✅

## ✨ What's New

Your AI Boss now operates completely autonomously with:

### 1. **Learning Engine** 🧠
- Analyzes every team member's behavioral patterns
- Predicts who will be late, who needs tasks, productivity peaks
- Generates insights and recommendations
- Improves predictions over time

### 2. **Workflow Automation** ⚡
Automatic action chains:
- **Task assigned** → Wait 2h → Remind → Wait 2h → Escalate
- **User stuck** → Offer help → Wait 30min → Alert admin
- **Reschedule request** → Get approval → Execute or reject

### 3. **Admin Approval System** ✋
**Before any task assignment or reschedule**, bot asks YOU:

```
🔔 Approval Required

Task Assignment Request
• Intern: John Doe
• Priority: high
• Reason: No pending tasks

Reply with:
• `approve task_assign_1234` to approve
• `reject task_assign_1234` to reject
```

You respond:
```
approve task_assign_1234
```

Bot executes the approved action!

### 4. **Proactive Management** 🤖
Bot now operates on a schedule (no messages needed):

| Time | Action |
|------|--------|
| **10:00 AM** | Check who's absent, start reminders |
| **10:30 AM** | Send reminders to absent team |
| **11:00 AM** | Alert you about persistent absences |
| **1:00 PM** | Predict who needs tasks → ask approval |
| **3:00 PM** | Check stuck tasks, offer help |
| **6:00 PM** | Send day summary to each team member |
| **10:00 PM** | Send YOU full day report + predictions |
| **Every 15 min** | Monitor for frustration, offer help |
| **Sunday 8 PM** | Send YOU weekly team insights |

## 📝 Admin Commands

### Check Approval Queue
```
pending approvals
```

### Approve Request
```
approve task_assign_1234
```

### Reject Request
```
reject task_assign_1234 team is overloaded
```

## 🧪 Testing

### Test 1: Approval System
DM the bot:
```
pending approvals
```

### Test 2: Stuck Detection
Have an intern say:
```
I'm stuck on this task, getting errors
```

Bot should:
1. Offer help immediately
2. Start workflow to monitor
3. If still stuck after 30 min → notify you

### Test 3: Proactive Management
Wait for scheduled times (or check logs):
- 10 AM: Morning check-in monitoring
- 1 PM: Task prediction with approval requests
- 6 PM: Day summaries to team
- 10 PM: Full report to you

### Test 4: Evening Summary (10 PM)
You'll receive:
```
📊 Daily Team Summary - 2025-01-15

*John Doe* (Developer):
   ✅ Attendance
   📋 3 tasks completed
   📊 Overall: 85% completion rate

*Jane Smith* (Designer):
   ✅ Attendance
   📋 2 tasks completed
   📊 Overall: 90% completion rate

Predictions for Tomorrow:
• John Doe: likely_on_time (95% confidence)
• Jane Smith: might_need_tasks (80% confidence)

Recommendations:
• John Doe: Performs best in morning hours
• Jane Smith: Engagement high, consider complex tasks
```

## 🔄 How It Works

### Message Flow
```
Message arrives
  ↓
Check: Is this an approval command?
  ├─ Yes → Process approval
  └─ No → Continue
  ↓
Load full context (DB + semantic search)
  ↓
AI analyzes with context
  ↓
Check: Should trigger workflow?
  ├─ User stuck? → Start stuck workflow
  └─ Task assigned? → Start monitor workflow
  ↓
Execute AI decision
  ↓
Store in database
```

### Approval Flow
```
System needs approval
  ↓
Add to approval queue
  ↓
Send you DM with details
  ↓
You reply: approve/reject
  ↓
System executes or cancels
  ↓
Pattern recorded for learning
  ↓
After 10+ similar approvals → auto-approve future
```

### Learning Flow
```
Daily interactions
  ↓
Pattern analysis every evening
  ↓
Extract:
  - Active hours
  - Task completion patterns
  - Punctuality trends
  - Mood indicators
  ↓
Generate predictions
  ↓
Use for proactive decisions
```

## 📊 Expected Behavior

### Morning (10 AM)
- Bot checks attendance
- Detects who hasn't checked in
- At 10:30: Sends reminders
- At 11:00: Alerts you about absences

### Midday (1 PM)
- Bot analyzes who needs tasks
- Checks learning patterns
- Sends YOU approval request:
  ```
  🔔 Jane Smith has no tasks
  Pattern analysis: High performer, needs work
  Approve task assignment?
  ```

### Afternoon (3 PM)
- Monitors task progress
- Detects stuck users
- Offers help automatically
- Escalates if needed

### Evening (6 PM)
- Sends each team member their day summary:
  ```
  📊 End of Day Summary for John
  ✅ Checked in: 9:45 AM
  📋 Tasks:
  • Completed today: 3
  • Still pending: 1

  Great work today! 🎉
  ```

### Night (10 PM)
- Sends YOU complete report
- Team stats
- Individual performance
- Predictions for tomorrow
- Recommendations

## 🎯 Key Features

1. **No Manual Task Assignment**
   - Bot predicts when someone needs tasks
   - Asks your approval
   - Assigns automatically

2. **Automatic Follow-Ups**
   - Tasks with no progress → Auto-reminder
   - Still no progress → Alert you

3. **Stuck Detection**
   - Detects frustration keywords
   - Offers help immediately
   - Escalates if unresolved

4. **Pattern Learning**
   - Learns who's usually late
   - Predicts productivity patterns
   - Suggests optimal task timing

5. **Admin Control**
   - You approve all key decisions
   - Simple approve/reject commands
   - Auto-approval after pattern confidence

## 🔧 Configuration

All settings in `.env`:

```bash
# Required
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
ADMIN_USER_ID=U...
OPENAI_API_KEY=sk-...

# Channel IDs
TECH_CHANNEL_ID=C...
SALES_CHANNEL_ID=C...
OUTREACH_CHANNEL_ID=C...
SHITPOSTERS_CHANNEL_ID=C...

# Timezone for cron jobs
TIMEZONE=Asia/Kolkata

# Database (Replit provides automatically)
DATABASE_URL=postgresql://...

# Optional: Semantic search
QDRANT_CLOUD_URL=https://...
QDRANT_API_KEY=...
```

## 📖 Documentation

- **INTEGRATION.md** - Complete system architecture
- **REPLIT_SETUP.md** - Database setup details
- **RESTART_INSTRUCTIONS.md** - Quick restart guide

## 🐛 Troubleshooting

### Bot not starting workflows
Check logs for:
```
✅ Workflow Engine initialized
✅ Approval Queue initialized
✅ Proactive Manager initialized
```

### Approvals not arriving
Check:
1. Bot has permission to DM you
2. `ADMIN_USER_ID` is correct in `.env`
3. Check bot logs for "Sending approval request"

### Cron jobs not running
Check:
1. Timezone is correct (`TIMEZONE=Asia/Kolkata`)
2. Server time matches expected timezone
3. Bot logs show "Initializing Proactive Management System"

### Database errors
```bash
# Re-run setup
node database/setup-replit.js

# Check tables exist
node -e "const pg = require('./database/postgres'); pg.query('SELECT * FROM interns LIMIT 1').then(r => console.log('DB OK')).catch(e => console.error(e))"
```

## 🎉 You're Done!

The bot now:
- ✅ Operates autonomously 24/7
- ✅ Requests your approval for key decisions
- ✅ Learns from patterns
- ✅ Monitors team proactively
- ✅ Predicts needs before they arise
- ✅ Follows up automatically
- ✅ Reports insights daily/weekly

**Your AI chief of staff is ready!** 🤖✨

Just pull the code, restart, and watch it work!
