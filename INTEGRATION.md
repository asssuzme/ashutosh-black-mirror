# AI Boss 2.0 - Autonomous Systems Integration Guide

## Overview

AI Boss 2.0 is now a fully autonomous management system with four core subsystems:

1. **Learning Engine** - Pattern analysis and predictions
2. **Workflow Engine** - Automated action chains
3. **Approval Queue** - Admin oversight for key decisions
4. **Proactive Manager** - Continuous monitoring and management

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         index.js                             │
│                    (Main Bot Controller)                     │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐   ┌──────────────────┐   ┌──────────────┐
│ AI Decision   │   │ Conversation     │   │ Database     │
│ Engine        │   │ Memory           │   │ (PostgreSQL) │
└───────────────┘   └──────────────────┘   └──────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│                    Autonomous Systems                        │
├─────────────────┬─────────────────┬─────────────────────────┤
│ Learning Engine │ Workflow Engine │ Approval Queue          │
│                 │                 │                         │
│ • Analyze       │ • Task monitor  │ • Request approval      │
│   patterns      │ • Auto-followup │ • Track decisions       │
│ • Predict needs │ • Stuck detect  │ • Learn patterns        │
│ • Team insights │ • Chain actions │ • Auto-approve safe     │
└─────────────────┴─────────────────┴─────────────────────────┘
        │                   │                     │
        └───────────────────┼─────────────────────┘
                            ▼
                ┌────────────────────────┐
                │  Proactive Manager     │
                │  (Cron-based Monitor)  │
                │                        │
                │ • Morning check-ins    │
                │ • Task monitoring      │
                │ • Continuous checks    │
                │ • Daily/weekly reports │
                └────────────────────────┘
```

## How It Works

### 1. Message Flow

When a message is received:

```javascript
1. Message arrives → index.js
2. Check for admin approval commands (approve/reject)
   ├─ If approval command → Process via approvalQueue
   └─ If not → Continue to AI
3. Build conversation context (database + semantic search)
4. AI analyzes message with full context
5. Check for workflow triggers (stuck, frustrated)
6. Execute AI decision (respond, take action)
7. Store conversation in database
```

### 2. Learning Engine

**Location**: `systems/learningEngine.js`

**Purpose**: Analyze patterns and predict behavior

**Key Functions**:
- `analyzeUserPatterns(userId)` - Extract behavioral patterns from history
- `generateTeamInsights(interns)` - Team-wide analysis and predictions
- `predictBehavior(userId, action)` - Predict user actions

**Used By**:
- Proactive Manager (for predicting who needs tasks)
- AI Decision Engine (for context)
- Evening summaries (for recommendations)

**Example**:
```javascript
const patterns = await learningEngine.analyzeUserPatterns(userId);

// Returns:
{
  activeHours: [9, 10, 11, 14, 15, 16],
  taskCompletionRate: 85,
  punctuality: { onTimePercentage: 90, latePercentage: 10 },
  currentMood: 'positive',
  likelyToBeLateTomorrow: false,
  likelyToNeedTasks: true,
  preferredTaskTypes: ['coding', 'documentation']
}
```

### 3. Workflow Engine

**Location**: `systems/workflowEngine.js`

**Purpose**: Automated action chains (if-then logic)

**Key Workflows**:

#### task_assigned
Monitors tasks and follows up automatically:
```
Task assigned → Wait 2h → Check progress → No update?
→ Send reminder → Wait 2h → Still no update?
→ Escalate to admin
```

#### user_stuck
Detects and helps stuck users:
```
Frustration detected → Offer help → Wait 30min
→ Still stuck? → Notify admin
```

#### meeting_reschedule_request
Handles reschedule requests with approval:
```
Request received → Ask admin approval → Wait for decision
→ If approved: Execute → If rejected: Notify requester
```

**Starting Workflows**:
```javascript
// In index.js executeAction()
await workflowEngine.startWorkflow('task_assigned', {
  userId: intern.slack_id,
  taskTitle: task.title,
  since: new Date()
});
```

### 4. Approval Queue

**Location**: `systems/approvalQueue.js`

**Purpose**: Admin approval for key actions

**Flow**:
```
1. System needs approval → addApproval()
2. Admin receives DM with approval request
3. Admin replies: "approve [id]" or "reject [id] [reason]"
4. System executes approved action or notifies requester
5. Pattern learning: Track approval history
```

**Admin Commands**:
- `approve task_assign_123` - Approve request
- `reject task_assign_123 too busy` - Reject with reason
- `pending approvals` - View all pending approvals

**Auto-Approval Learning**:
After 10+ approvals of same type with 100% approval rate, system can auto-approve future similar requests.

### 5. Proactive Manager

**Location**: `systems/proactiveManager.js`

**Purpose**: Autonomous monitoring and management

**Schedule** (Asia/Kolkata timezone):

| Time | Action | Description |
|------|--------|-------------|
| 10:00 AM | Morning check-in | Detect who hasn't checked in, start workflows |
| 10:30 AM | Reminder round | Send friendly reminders to absent team members |
| 11:00 AM | Late escalation | Notify admin of persistent absences |
| 1:00 PM | Task check | Use learning to predict who needs tasks → approval |
| 3:00 PM | Progress check | Monitor stuck tasks, offer help, escalate if needed |
| 6:00 PM | Day validation | Send end-of-day summary to each team member |
| 10:00 PM | Admin summary | Full day report with insights and predictions |
| Every 15min | Continuous monitor | Detect frustration, offer help, start workflows |
| Sun 8 PM | Weekly insights | Team performance report with recommendations |

**Key Feature**: Before assigning tasks, requests admin approval:
```javascript
await approvalQueue.addApproval({
  type: 'task_assignment',
  context: {
    internName: intern.name,
    reason: 'Pattern analysis suggests user will need tasks soon'
  }
});
```

## Admin Approval System

### How Admin Interacts

1. **Receive Approval Request**:
```
🔔 Approval Required

Task Assignment Request
• Intern: John Doe
• Task: Build login feature
• Priority: high
• Estimated Time: 120 mins

Reason: No pending tasks

Reply with:
• `approve task_assign_1234` to approve
• `reject task_assign_1234` to reject
```

2. **Respond**:
```
Admin: approve task_assign_1234
Bot: ✅ Approved: No pending tasks
     Executing action...
```

3. **Check Queue**:
```
Admin: pending approvals
Bot: 📋 Pending Approvals (2)

1. task_assign_1235
   Type: task_assignment
   Reason: Pattern analysis suggests user will need tasks soon
   For: Jane Smith
   Requested: 2025-01-15, 1:30 PM

   Reply with: `approve task_assign_1235` or `reject task_assign_1235 [reason]`
```

## Integration Points

### 1. AI Decision → Workflows

When AI detects certain conditions, workflows are triggered:

```javascript
// In index.js processMessageWithAI()
const stuckIndicators = ['stuck', 'problem', 'issue', 'error'];
const seemsStuck = stuckIndicators.some(word => messageText.includes(word));

if (seemsStuck) {
  await workflowEngine.startWorkflow('user_stuck', {
    userId: message.user,
    internName: intern.name,
    since: new Date()
  });
}
```

### 2. Task Assignment → Workflow

When tasks are assigned, monitoring starts:

```javascript
// In index.js executeAction()
case 'assign_tasks':
  await memory.assignTasks(userId, tasks);

  // Start monitoring workflow for each task
  for (const task of tasks) {
    await workflowEngine.startWorkflow('task_assigned', {
      userId: message.user,
      taskTitle: task.title
    });
  }
```

### 3. Proactive Manager → Approval Queue

Proactive manager requests approval before actions:

```javascript
// In proactiveManager.js middayTaskCheck()
if (pendingTasks.length === 0 || patterns.likelyToNeedTasks) {
  await approvalQueue.addApproval({
    type: 'task_assignment',
    context: {
      internName: intern.name,
      reason: 'Pattern analysis suggests user will need tasks'
    }
  });
}
```

### 4. Learning Engine → Proactive Decisions

Learning engine informs proactive actions:

```javascript
// In proactiveManager.js
const patterns = await learningEngine.analyzeUserPatterns(intern.slack_id);

if (patterns.likelyToBeLateTomorrow) {
  insights.alerts.push({
    type: 'punctuality_risk',
    message: `${intern.name} likely to be late tomorrow`
  });
}
```

## Data Flow

### Conversation Storage
```
Message received
  ↓
AI processes
  ↓
Store in PostgreSQL:
  - Message text
  - AI decision (full JSON)
  - Actions taken
  - Intent
  - Thread context
  ↓
Generate embedding (OpenAI)
  ↓
Store in Qdrant for semantic search
  ↓
Future context loading:
  - Last 10 conversations
  - Similar past interactions
  - Thread history
```

### Learning Insights
```
Daily interactions
  ↓
Pattern analysis (Learning Engine)
  ↓
Insights stored in learning_insights table:
  - Task completion patterns
  - Punctuality trends
  - Mood analysis
  - Productivity peaks
  ↓
Used for predictions and recommendations
```

## Environment Variables

Required for full functionality:

```bash
# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
ADMIN_USER_ID=U...

# OpenAI
OPENAI_API_KEY=sk-...

# Channel IDs
TECH_CHANNEL_ID=C...
SALES_CHANNEL_ID=C...
OUTREACH_CHANNEL_ID=C...
SHITPOSTERS_CHANNEL_ID=C...

# Database (Replit provides automatically)
DATABASE_URL=postgresql://...

# Optional: Qdrant for semantic search
QDRANT_CLOUD_URL=https://...
QDRANT_API_KEY=...

# Timezone
TIMEZONE=Asia/Kolkata
```

## Testing the System

### 1. Test Approval System

Admin sends:
```
pending approvals
```

Expected: List of pending approvals or "No pending approvals"

### 2. Test Workflow Triggers

Intern sends:
```
I'm stuck on this task, getting errors
```

Expected:
- Bot offers help
- Workflow 'user_stuck' starts
- After 30min with no resolution → Admin notified

### 3. Test Proactive Management

Wait for scheduled times:
- 10:00 AM - Check-in monitoring starts
- 1:00 PM - Task needs prediction
- 6:00 PM - End of day summaries

### 4. Test Learning Engine

Check evening admin summary (10 PM):
```
📊 Daily Team Summary

*John Doe* (Developer):
   ✅ Attendance
   📋 3 tasks completed
   📊 Overall: 85% completion rate

Predictions for Tomorrow:
• John Doe: likely_on_time (95% confidence)
• Jane Smith: might_need_tasks (80% confidence)

Recommendations:
• John Doe: Performs best in morning hours
```

## Troubleshooting

### Workflows not starting
Check that workflowEngine.initialize() was called in index.js:
```javascript
workflowEngine.initialize(app, ADMIN_USER_ID);
```

### Approvals not sending
Check that approvalQueue.initialize() was called:
```javascript
approvalQueue.initialize(app, ADMIN_USER_ID);
```

### Cron jobs not running
Check timezone setting and that proactiveManager.initialize() was called:
```javascript
proactiveManager.initialize(app, ADMIN_USER_ID);
```

### Database errors
Ensure PostgreSQL is enabled in Replit:
```bash
# Check connection
node database/setup-replit.js
```

## Benefits of This Architecture

1. **Truly Autonomous** - Initiates actions without waiting for messages
2. **Admin Control** - Key decisions require approval
3. **Learning** - Improves predictions over time
4. **Scalable** - Handles growing teams without code changes
5. **Context-Aware** - Full conversation history + semantic search
6. **Maintainable** - Clear separation of concerns

## Next Steps

1. Monitor approval patterns to refine auto-approval rules
2. Enhance learning engine with more behavioral signals
3. Add more workflow types as patterns emerge
4. Implement sentiment analysis for mood tracking
5. Add team collaboration workflows

---

**The bot is now a fully autonomous AI chief of staff!** 🤖✨
