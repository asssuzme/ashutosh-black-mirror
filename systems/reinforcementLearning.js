/**
 * Reinforcement Learning System
 * Tracks decision outcomes and automatically adjusts bot behavior
 * True self-learning through reward/penalty feedback
 */

const postgres = require('../database/postgres');

// Learning state - tracks weights and parameters
const learningState = {
  // Decision weights (adjusted based on success)
  decisionWeights: {
    task_assignment_confidence: 0.5,      // How confident to be before assigning tasks
    reminder_urgency: 0.5,                // How urgent/frequent reminders should be
    escalation_threshold: 0.5,            // How quickly to escalate to admin
    check_in_strictness: 0.5,             // How strict about check-ins
    stuck_detection_sensitivity: 0.5      // How sensitive to detecting stuck users
  },

  // Workflow timing parameters (adjusted based on outcomes)
  workflowTimings: {
    task_reminder_initial: 2 * 60 * 60 * 1000,      // Initial: 2 hours
    task_reminder_followup: 2 * 60 * 60 * 1000,     // Followup: 2 hours
    stuck_user_wait: 30 * 60 * 1000,                // Wait: 30 minutes
    check_in_reminder_delay: 30 * 60 * 1000,        // Wait: 30 minutes
    check_in_escalation_delay: 30 * 60 * 1000       // Wait: 30 minutes
  },

  // Per-user learned preferences
  userPreferences: new Map(),

  // Success history
  successHistory: [],

  // Learning rate (how quickly to adjust)
  learningRate: 0.1,

  // Minimum samples before adjusting
  minSamplesBeforeAdjustment: 5
};

/**
 * Track an action and its context
 */
async function trackAction(actionData) {
  const action = {
    id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: actionData.type,
    userId: actionData.userId,
    context: actionData.context,
    parameters: actionData.parameters,
    timestamp: new Date(),
    outcome: null,  // To be filled when outcome is known
    reward: null    // Reward/penalty score
  };

  // Store in memory for tracking
  learningState.successHistory.push(action);

  // Store in database
  await storeActionInDB(action);

  console.log(`📊 Tracking action: ${action.type} for user ${actionData.userId || 'N/A'}`);

  return action.id;
}

/**
 * Record outcome of an action (success/failure/partial)
 */
async function recordOutcome(actionId, outcome) {
  const action = learningState.successHistory.find(a => a.id === actionId);

  if (!action) {
    console.warn(`Action ${actionId} not found for outcome recording`);
    return;
  }

  action.outcome = outcome.result;  // 'success', 'failure', 'partial', 'ignored'
  action.reward = calculateReward(action, outcome);
  action.outcomeTimestamp = new Date();
  action.outcomeDetails = outcome.details;

  console.log(`🎯 Outcome recorded: ${action.type} -> ${outcome.result} (reward: ${action.reward})`);

  // Update in database
  await updateActionOutcomeInDB(action);

  // Trigger learning adjustment
  await adjustBehaviorFromOutcome(action);

  // Per-user learning
  if (action.userId) {
    await updateUserPreferences(action.userId, action);
  }
}

/**
 * Calculate reward score from outcome
 */
function calculateReward(action, outcome) {
  const baseRewards = {
    'success': 1.0,
    'partial': 0.3,
    'failure': -0.5,
    'ignored': -0.8
  };

  let reward = baseRewards[outcome.result] || 0;

  // Adjust reward based on action type importance
  const importanceMultipliers = {
    'task_assignment': 1.5,      // High importance
    'check_in_reminder': 1.2,
    'escalation': 1.3,
    'stuck_detection': 1.4,
    'reminder': 1.0,
    'message': 0.8
  };

  reward *= (importanceMultipliers[action.type] || 1.0);

  // Time-based adjustment (faster success = better)
  if (outcome.result === 'success' && outcome.responseTime) {
    const responseMinutes = outcome.responseTime / (1000 * 60);
    if (responseMinutes < 5) {
      reward *= 1.2;  // Quick response bonus
    } else if (responseMinutes > 60) {
      reward *= 0.8;  // Slow response penalty
    }
  }

  // Admin feedback multiplier
  if (outcome.adminFeedback) {
    reward *= outcome.adminFeedback === 'positive' ? 1.5 : 0.5;
  }

  return reward;
}

/**
 * Adjust bot behavior based on action outcome
 */
async function adjustBehaviorFromOutcome(action) {
  const { type, reward, parameters } = action;

  // Only adjust after minimum samples
  const recentSimilarActions = learningState.successHistory.filter(a =>
    a.type === type &&
    a.outcome !== null &&
    (Date.now() - new Date(a.timestamp)) < 7 * 24 * 60 * 60 * 1000  // Last 7 days
  );

  if (recentSimilarActions.length < learningState.minSamplesBeforeAdjustment) {
    console.log(`⏳ Need ${learningState.minSamplesBeforeAdjustment - recentSimilarActions.length} more samples for ${type}`);
    return;
  }

  // Calculate average reward for this action type
  const avgReward = recentSimilarActions.reduce((sum, a) => sum + a.reward, 0) / recentSimilarActions.length;

  console.log(`📈 ${type}: avg reward = ${avgReward.toFixed(2)} (${recentSimilarActions.length} samples)`);

  // Adjust decision weights based on average reward
  switch (type) {
    case 'task_assignment':
      adjustWeight('task_assignment_confidence', avgReward);
      break;

    case 'reminder':
      adjustWeight('reminder_urgency', avgReward);
      // Also adjust timing if reward is negative
      if (avgReward < 0) {
        adjustTiming('task_reminder_initial', 1.2);  // Wait longer
      } else if (avgReward > 0.5) {
        adjustTiming('task_reminder_initial', 0.9);  // Can be faster
      }
      break;

    case 'escalation':
      adjustWeight('escalation_threshold', avgReward);
      break;

    case 'check_in_reminder':
      adjustWeight('check_in_strictness', avgReward);
      if (avgReward < 0) {
        adjustTiming('check_in_reminder_delay', 1.3);  // Be less aggressive
      }
      break;

    case 'stuck_detection':
      adjustWeight('stuck_detection_sensitivity', avgReward);
      adjustTiming('stuck_user_wait', avgReward > 0 ? 0.9 : 1.2);
      break;
  }

  // Store learning insights
  await storeLearningInsight({
    type: 'behavior_adjustment',
    actionType: type,
    avgReward,
    sampleCount: recentSimilarActions.length,
    adjustments: {
      weights: learningState.decisionWeights,
      timings: learningState.workflowTimings
    }
  });
}

/**
 * Adjust a decision weight based on reward
 */
function adjustWeight(weightName, reward) {
  const currentWeight = learningState.decisionWeights[weightName];
  const adjustment = learningState.learningRate * reward;
  const newWeight = Math.max(0.1, Math.min(0.9, currentWeight + adjustment));

  if (Math.abs(newWeight - currentWeight) > 0.01) {
    console.log(`🔧 Adjusting ${weightName}: ${currentWeight.toFixed(2)} -> ${newWeight.toFixed(2)}`);
    learningState.decisionWeights[weightName] = newWeight;
  }
}

/**
 * Adjust a timing parameter
 */
function adjustTiming(timingName, multiplier) {
  const currentTiming = learningState.workflowTimings[timingName];
  const newTiming = Math.round(currentTiming * multiplier);

  // Keep within reasonable bounds
  const minTiming = 5 * 60 * 1000;   // 5 minutes
  const maxTiming = 4 * 60 * 60 * 1000;  // 4 hours

  const boundedTiming = Math.max(minTiming, Math.min(maxTiming, newTiming));

  if (boundedTiming !== currentTiming) {
    console.log(`⏱️  Adjusting ${timingName}: ${currentTiming / 60000}min -> ${boundedTiming / 60000}min`);
    learningState.workflowTimings[timingName] = boundedTiming;
  }
}

/**
 * Update per-user preferences
 */
async function updateUserPreferences(userId, action) {
  if (!learningState.userPreferences.has(userId)) {
    learningState.userPreferences.set(userId, {
      bestReminderTime: null,
      respondsToReminderType: null,
      escalationNeeded: null,
      taskAssignmentPreference: null,
      averageResponseTime: null
    });
  }

  const prefs = learningState.userPreferences.get(userId);

  // Learn best reminder timing
  if (action.type === 'reminder' && action.outcome === 'success') {
    const hour = new Date(action.timestamp).getHours();
    prefs.bestReminderTime = hour;
  }

  // Learn if escalation helps
  if (action.type === 'escalation') {
    prefs.escalationNeeded = action.reward > 0;
  }

  // Learn response time patterns
  if (action.outcomeDetails?.responseTime) {
    if (!prefs.averageResponseTime) {
      prefs.averageResponseTime = action.outcomeDetails.responseTime;
    } else {
      prefs.averageResponseTime = (prefs.averageResponseTime * 0.7) + (action.outcomeDetails.responseTime * 0.3);
    }
  }

  console.log(`👤 Updated preferences for user ${userId}:`, prefs);
}

/**
 * Get current decision weight (for use in bot logic)
 */
function getDecisionWeight(weightName) {
  return learningState.decisionWeights[weightName] || 0.5;
}

/**
 * Get current workflow timing (for use in workflows)
 */
function getWorkflowTiming(timingName) {
  return learningState.workflowTimings[timingName];
}

/**
 * Get user-specific preferences
 */
function getUserPreferences(userId) {
  return learningState.userPreferences.get(userId) || null;
}

/**
 * Should we take this action? (RL-based decision)
 */
function shouldTakeAction(actionType, context = {}) {
  const weight = getDecisionWeight(`${actionType}_confidence`) || 0.5;

  // Get historical success rate
  const recentActions = learningState.successHistory.filter(a =>
    a.type === actionType &&
    a.outcome !== null &&
    (Date.now() - new Date(a.timestamp)) < 7 * 24 * 60 * 60 * 1000
  );

  if (recentActions.length === 0) {
    // No history, use default weight
    return weight > 0.5;
  }

  const successRate = recentActions.filter(a => a.outcome === 'success').length / recentActions.length;

  // Combine weight with success rate
  const confidence = (weight * 0.6) + (successRate * 0.4);

  console.log(`🤔 Should ${actionType}? Confidence: ${(confidence * 100).toFixed(0)}% (weight: ${weight.toFixed(2)}, success: ${(successRate * 100).toFixed(0)}%)`);

  // Higher confidence = more likely to act
  return confidence > 0.5;
}

/**
 * Generate learning report
 */
async function generateLearningReport() {
  const report = {
    timestamp: new Date(),
    totalActions: learningState.successHistory.length,
    actionsLast7Days: learningState.successHistory.filter(a =>
      (Date.now() - new Date(a.timestamp)) < 7 * 24 * 60 * 60 * 1000
    ).length,

    decisionWeights: { ...learningState.decisionWeights },
    workflowTimings: { ...learningState.workflowTimings },

    actionSuccessRates: {},
    learningInsights: []
  };

  // Calculate success rates by action type
  const actionTypes = [...new Set(learningState.successHistory.map(a => a.type))];

  for (const type of actionTypes) {
    const actions = learningState.successHistory.filter(a => a.type === type && a.outcome !== null);
    if (actions.length > 0) {
      const successCount = actions.filter(a => a.outcome === 'success').length;
      const avgReward = actions.reduce((sum, a) => sum + (a.reward || 0), 0) / actions.length;

      report.actionSuccessRates[type] = {
        total: actions.length,
        successRate: (successCount / actions.length * 100).toFixed(1) + '%',
        averageReward: avgReward.toFixed(2)
      };
    }
  }

  // Generate insights
  report.learningInsights = generateInsights();

  return report;
}

/**
 * Generate learning insights
 */
function generateInsights() {
  const insights = [];

  // Insight: What's working well
  const actionTypes = [...new Set(learningState.successHistory.map(a => a.type))];
  for (const type of actionTypes) {
    const actions = learningState.successHistory.filter(a =>
      a.type === type &&
      a.outcome !== null &&
      (Date.now() - new Date(a.timestamp)) < 7 * 24 * 60 * 60 * 1000
    );

    if (actions.length >= 5) {
      const successRate = actions.filter(a => a.outcome === 'success').length / actions.length;

      if (successRate > 0.7) {
        insights.push({
          type: 'success',
          message: `${type} is working well (${(successRate * 100).toFixed(0)}% success rate)`,
          actionType: type,
          successRate
        });
      } else if (successRate < 0.3) {
        insights.push({
          type: 'needs_improvement',
          message: `${type} needs adjustment (only ${(successRate * 100).toFixed(0)}% success rate)`,
          actionType: type,
          successRate
        });
      }
    }
  }

  // Insight: Timing adjustments
  Object.keys(learningState.workflowTimings).forEach(timing => {
    const original = {
      task_reminder_initial: 2 * 60 * 60 * 1000,
      task_reminder_followup: 2 * 60 * 60 * 1000,
      stuck_user_wait: 30 * 60 * 1000,
      check_in_reminder_delay: 30 * 60 * 1000,
      check_in_escalation_delay: 30 * 60 * 1000
    }[timing];

    const current = learningState.workflowTimings[timing];
    const changePercent = ((current - original) / original * 100).toFixed(0);

    if (Math.abs(changePercent) > 10) {
      insights.push({
        type: 'timing_adjusted',
        message: `${timing} adjusted by ${changePercent > 0 ? '+' : ''}${changePercent}% based on outcomes`,
        timing,
        changePercent
      });
    }
  });

  return insights;
}

/**
 * Store action in database
 */
async function storeActionInDB(action) {
  try {
    const query = `
      INSERT INTO learning_insights (
        insight_type, title, description, confidence_score,
        supporting_data, applied, applied_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    await postgres.query(query, [
      'rl_action',
      `Action: ${action.type}`,
      JSON.stringify(action.context),
      0.5,
      JSON.stringify({
        actionId: action.id,
        type: action.type,
        userId: action.userId,
        parameters: action.parameters,
        timestamp: action.timestamp
      }),
      false,
      null
    ]);
  } catch (error) {
    console.error('Error storing action in DB:', error);
  }
}

/**
 * Update action outcome in database
 */
async function updateActionOutcomeInDB(action) {
  try {
    const query = `
      UPDATE learning_insights
      SET confidence_score = $1,
          applied = $2,
          applied_at = $3,
          supporting_data = $4
      WHERE insight_type = 'rl_action'
      AND supporting_data->>'actionId' = $5
    `;

    await postgres.query(query, [
      action.reward,
      action.outcome === 'success',
      action.outcomeTimestamp,
      JSON.stringify({
        actionId: action.id,
        type: action.type,
        userId: action.userId,
        parameters: action.parameters,
        timestamp: action.timestamp,
        outcome: action.outcome,
        reward: action.reward,
        outcomeDetails: action.outcomeDetails
      }),
      action.id
    ]);
  } catch (error) {
    console.error('Error updating action outcome in DB:', error);
  }
}

/**
 * Store learning insight
 */
async function storeLearningInsight(insight) {
  try {
    const query = `
      INSERT INTO learning_insights (
        insight_type, title, description, confidence_score,
        supporting_data, applied, applied_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    await postgres.query(query, [
      insight.type,
      `Behavior Adjustment: ${insight.actionType}`,
      `Adjusted based on ${insight.sampleCount} samples with avg reward ${insight.avgReward.toFixed(2)}`,
      Math.abs(insight.avgReward),
      JSON.stringify(insight.adjustments),
      true,
      new Date()
    ]);
  } catch (error) {
    console.error('Error storing learning insight:', error);
  }
}

/**
 * Export current learning state (for backup/restore)
 */
function exportLearningState() {
  return {
    decisionWeights: { ...learningState.decisionWeights },
    workflowTimings: { ...learningState.workflowTimings },
    userPreferences: Array.from(learningState.userPreferences.entries()),
    timestamp: new Date()
  };
}

/**
 * Import learning state (for backup/restore)
 */
function importLearningState(state) {
  if (state.decisionWeights) {
    learningState.decisionWeights = { ...state.decisionWeights };
  }
  if (state.workflowTimings) {
    learningState.workflowTimings = { ...state.workflowTimings };
  }
  if (state.userPreferences) {
    learningState.userPreferences = new Map(state.userPreferences);
  }
  console.log('✅ Learning state imported from:', state.timestamp);
}

module.exports = {
  trackAction,
  recordOutcome,
  getDecisionWeight,
  getWorkflowTiming,
  getUserPreferences,
  shouldTakeAction,
  generateLearningReport,
  exportLearningState,
  importLearningState,
  learningState  // For debugging/monitoring
};
