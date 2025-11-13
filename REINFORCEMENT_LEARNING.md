# Reinforcement Learning System - True Self-Learning

## Overview

The bot now has **TRUE reinforcement learning** - it tracks every action, measures outcomes, and automatically adjusts its behavior to optimize success.

## How It Works

### 1. **Track Actions**
Every time the bot takes an action, it's tracked with context:

```javascript
const actionId = await reinforcementLearning.trackAction({
  type: 'task_assignment',        // Type of action
  userId: 'U12345',               // Who it affects
  context: {                      // Context details
    internName: 'John Doe',
    taskTitle: 'Build feature X',
    priority: 'high'
  },
  parameters: {                   // Action parameters
    estimatedTime: 120,
    assignedAt: new Date()
  }
});
```

### 2. **Record Outcomes**
When we see the result (success/failure/partial), record it:

```javascript
await reinforcementLearning.recordOutcome(actionId, {
  result: 'success',              // or 'failure', 'partial', 'ignored'
  responseTime: 15 * 60 * 1000,   // How long until user responded (ms)
  details: {                      // Additional outcome details
    taskCompleted: true,
    quality: 'high'
  },
  adminFeedback: 'positive'       // Optional: 'positive' or 'negative'
});
```

### 3. **Automatic Behavior Adjustment**
The system automatically:
- Calculates reward scores (-0.8 to +1.5)
- Adjusts decision weights
- Optimizes workflow timings
- Learns per-user preferences

## What Gets Learned?

### Decision Weights (0.1 to 0.9)

Automatically adjusted based on success:

| Weight | Meaning | Adjusts Based On |
|--------|---------|------------------|
| `task_assignment_confidence` | How confident to assign tasks | Task completion rates |
| `reminder_urgency` | How urgent reminders should be | Response rates to reminders |
| `escalation_threshold` | How quickly to escalate issues | Escalation success |
| `check_in_strictness` | How strict about check-ins | Late check-in patterns |
| `stuck_detection_sensitivity` | How sensitive to stuck users | Help request outcomes |

**Example:**
```
Task assignments succeeding 80% of the time
→ task_assignment_confidence increases from 0.5 to 0.6
→ Bot becomes more confident in assigning tasks
```

### Workflow Timings

Automatically optimized based on outcomes:

| Timing | Initial | Adjusts To |
|--------|---------|------------|
| `task_reminder_initial` | 2 hours | 1.7 - 2.4 hours |
| `task_reminder_followup` | 2 hours | 1.7 - 2.4 hours |
| `stuck_user_wait` | 30 min | 25 - 36 min |
| `check_in_reminder_delay` | 30 min | 25 - 36 min |
| `check_in_escalation_delay` | 30 min | 25 - 36 min |

**Example:**
```
Reminders at 2h getting ignored (negative rewards)
→ task_reminder_initial increases to 2h 24min
→ Bot waits longer before reminding
```

### Per-User Preferences

Learns individual patterns:

```javascript
{
  bestReminderTime: 10,        // Best hour to remind this user
  respondsToReminderType: 'direct',
  escalationNeeded: false,     // Does escalation help for this user?
  taskAssignmentPreference: 'morning',
  averageResponseTime: 15 * 60 * 1000  // 15 minutes
}
```

## Reward Calculation

Rewards determine how much to adjust behavior:

### Base Rewards
- ✅ **Success:** +1.0
- 🟡 **Partial:** +0.3
- ❌ **Failure:** -0.5
- 🔕 **Ignored:** -0.8

### Multipliers

**Action Importance:**
- Task assignment: ×1.5
- Stuck detection: ×1.4
- Escalation: ×1.3
- Check-in reminder: ×1.2
- Regular reminder: ×1.0
- Message: ×0.8

**Response Time:**
- < 5 minutes: ×1.2 (bonus!)
- Normal: ×1.0
- > 60 minutes: ×0.8 (penalty)

**Admin Feedback:**
- Positive: ×1.5
- Negative: ×0.5

### Example Calculations

**Scenario 1: Quick task completion**
```
Action: task_assignment
Result: success (base: +1.0)
Importance: ×1.5
Response: 3 minutes (×1.2)
Admin feedback: positive (×1.5)

Reward = 1.0 × 1.5 × 1.2 × 1.5 = +2.7
→ Strong positive reinforcement
→ Increase task_assignment_confidence significantly
```

**Scenario 2: Ignored reminder**
```
Action: reminder
Result: ignored (base: -0.8)
Importance: ×1.0
Response: none
Admin feedback: none

Reward = -0.8 × 1.0 = -0.8
→ Negative reinforcement
→ Decrease reminder_urgency
→ Increase task_reminder_initial timing (wait longer)
```

## Admin Commands

### View Learning Report
```
learning report
```
or
```
rl report
```

**Example Output:**
```
🧠 Reinforcement Learning Report

**Actions Tracked:** 150 total (45 in last 7 days)

**Current Decision Weights:**
• task_assignment_confidence: 62%
• reminder_urgency: 48%
• escalation_threshold: 55%
• check_in_strictness: 58%
• stuck_detection_sensitivity: 65%

**Success Rates:**
• task_assignment: 78.5% (28 samples, avg reward: 0.85)
• reminder: 45.2% (15 samples, avg reward: -0.12)
• escalation: 90.0% (10 samples, avg reward: 1.10)
• check_in_reminder: 67.3% (12 samples, avg reward: 0.45)

**Learning Insights:**
✅ escalation is working well (90% success rate)
⚠️ reminder needs adjustment (only 45% success rate)
⏱️ task_reminder_initial adjusted by +15% based on outcomes
⏱️ stuck_user_wait adjusted by -10% based on outcomes
```

## Integration Examples

### Example 1: Task Assignment with Learning

```javascript
// Bot decides to assign tasks
const actionId = await reinforcementLearning.trackAction({
  type: 'task_assignment',
  userId: intern.slackId,
  context: {
    internName: intern.name,
    taskTitle: 'Build API endpoint',
    priority: 'high'
  }
});

// Assign the task
await assignTask(intern, task);

// Later: User completes task in 20 minutes
await reinforcementLearning.recordOutcome(actionId, {
  result: 'success',
  responseTime: 20 * 60 * 1000,
  details: { completed: true }
});

// System learns:
// → High confidence in task assignments (reward: +1.8)
// → This user responds quickly to tasks
// → Keep assigning similar tasks
```

### Example 2: Reminder Optimization

```javascript
// Bot sends reminder at 2h mark
const actionId = await reinforcementLearning.trackAction({
  type: 'reminder',
  userId: intern.slackId,
  context: { taskTitle: 'Fix bug', reminderNumber: 1 }
});

// User ignores it
await reinforcementLearning.recordOutcome(actionId, {
  result: 'ignored',
  responseTime: null
});

// System learns:
// → 2h too soon for reminders (reward: -0.8)
// → Adjusts task_reminder_initial to 2h 20min
// → Next reminder will wait longer
```

### Example 3: Per-User Learning

```javascript
// After 10+ actions for a user
const prefs = reinforcementLearning.getUserPreferences(userId);

// {
//   bestReminderTime: 14,  // 2 PM works best
//   averageResponseTime: 10 * 60 * 1000,  // 10 minutes
//   escalationNeeded: false  // They self-resolve
// }

// Use learned preferences
if (prefs.bestReminderTime === 14) {
  // Schedule reminders for 2 PM for this user
}
```

## Decision Making with RL

### Check if action should be taken

```javascript
// Should we assign tasks now?
const should = reinforcementLearning.shouldTakeAction('task_assignment', {
  userId: intern.slackId,
  currentLoad: intern.taskCount
});

// Returns: true/false based on:
// - Current confidence weight (0.62)
// - Historical success rate (78%)
// - Combined confidence: (0.62 × 0.6) + (0.78 × 0.4) = 0.68
// → 68% confidence → TRUE (above 50% threshold)
```

### Get optimized timing

```javascript
// How long to wait before first reminder?
const waitTime = reinforcementLearning.getWorkflowTiming('task_reminder_initial');
// Returns: 2 hours 24 minutes (adjusted from 2h based on learning)

// Use in workflow
setTimeout(() => sendReminder(), waitTime);
```

## Learning Progression

### Week 1: Initial State
```
All weights: 0.5 (50%)
All timings: Default values
No user preferences
Action count: 0
```

### Week 2: Early Learning
```
task_assignment_confidence: 0.55 (55%)
reminder_urgency: 0.45 (45%)
task_reminder_initial: 2h 12min
Action count: 80
Starting to see patterns
```

### Week 4: Established Patterns
```
task_assignment_confidence: 0.65 (65%)
reminder_urgency: 0.40 (40%)
escalation_threshold: 0.70 (70%)
task_reminder_initial: 2h 18min
stuck_user_wait: 27min
Action count: 250
Clear success patterns identified
```

### Month 3: Optimized
```
Weights optimized per action type
Timings fine-tuned for team
User preferences learned for all members
Auto-approval patterns established
Action count: 1000+
System highly optimized for your team
```

## Key Features

### 1. **Automatic Optimization**
- No manual tuning needed
- Adapts to your team's patterns
- Improves continuously

### 2. **Safe Learning**
- Weights bounded (0.1 to 0.9)
- Timings bounded (5min to 4h)
- Requires minimum samples (5) before adjusting
- Learning rate: 0.1 (conservative)

### 3. **Transparent**
- All decisions logged
- Learning insights generated
- Admin can view progress
- Can export/import learning state

### 4. **Context-Aware**
- Learns per action type
- Learns per user
- Considers time of day
- Accounts for urgency

## Monitoring Learning

### Check Learning Progress

```bash
# In Slack, DM bot:
learning report
```

### Watch for Insights

Bot will report significant changes:
```
⏱️ task_reminder_initial adjusted by +15% based on outcomes
✅ escalation is working well (90% success rate)
⚠️ reminder needs adjustment (only 45% success rate)
```

### Export Learning State

```javascript
const state = reinforcementLearning.exportLearningState();
// Save to file for backup
fs.writeFileSync('learning_state_backup.json', JSON.stringify(state));
```

### Import Learning State

```javascript
const state = JSON.parse(fs.readFileSync('learning_state_backup.json'));
reinforcementLearning.importLearningState(state);
```

## Benefits

1. **Adapts to Your Team**: Learns what works for YOUR specific team
2. **Reduces Annoyance**: Stops doing things that don't work
3. **Improves Efficiency**: Optimizes timing and approach
4. **No Manual Tuning**: Self-adjusts based on data
5. **Gets Smarter Over Time**: More data = better decisions

## Technical Details

- **Learning Algorithm**: Gradient-based weight adjustment
- **Learning Rate**: 0.1 (conservative, stable)
- **Minimum Samples**: 5 actions before adjustment
- **Reward Range**: -0.8 to +2.7 (after multipliers)
- **Weight Bounds**: 0.1 to 0.9
- **Timing Bounds**: 5 minutes to 4 hours
- **Data Retention**: All actions tracked in database
- **Update Frequency**: After each outcome

---

**The bot now truly learns from experience and gets better at managing your team over time!** 🧠✨
