/**
 * Slack Helper
 * Utility functions for Slack API interactions
 * - Message formatting
 * - User management
 * - Channel operations
 */

/**
 * Format tasks as Slack blocks for rich display
 * @param {Array} tasks - Array of task objects
 * @param {string} internName - Name of the intern
 * @returns {Array} Slack blocks
 */
function formatTasksAsBlocks(tasks, internName = '') {
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `📋 Daily Tasks${internName ? ` for ${internName}` : ''}`,
        emoji: true
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Good morning! Here are your tasks for today:`
      }
    },
    {
      type: 'divider'
    }
  ];

  tasks.forEach((task, index) => {
    const priorityEmoji = {
      high: '🔴',
      medium: '🟡',
      low: '🟢'
    };

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${index + 1}. ${task.title}* ${priorityEmoji[task.priority] || '⚪'}\n${task.description}\n_Est. time: ${task.estimatedTime || '30'} mins_`
      }
    });
  });

  blocks.push(
    {
      type: 'divider'
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '💡 Use `/progress <update>` to log progress | `/done` when complete'
        }
      ]
    }
  );

  return blocks;
}

/**
 * Format daily summary as Slack blocks
 * @param {string} summary - Summary text from AI
 * @param {Object} stats - Performance statistics
 * @returns {Array} Slack blocks
 */
function formatDailySummaryBlocks(summary, stats = {}) {
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📊 Daily Performance Summary',
        emoji: true
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: summary
      }
    }
  ];

  if (stats.attendance) {
    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Attendance:*\n${stats.attendance.present}/${stats.attendance.total} (${stats.attendance.rate}%)`
        },
        {
          type: 'mrkdwn',
          text: `*Tasks Completed:*\n${stats.tasksCompleted || 0}`
        },
        {
          type: 'mrkdwn',
          text: `*Progress Updates:*\n${stats.progressUpdates || 0}`
        },
        {
          type: 'mrkdwn',
          text: `*Avg. Quality:*\n${stats.avgQuality || 'N/A'}/10`
        }
      ]
    });
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Generated at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
      }
    ]
  });

  return blocks;
}

/**
 * Format weekly review as Slack blocks
 * @param {string} review - Review text from AI
 * @returns {Array} Slack blocks
 */
function formatWeeklyReviewBlocks(review) {
  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📈 Weekly Performance Review',
        emoji: true
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: review
      }
    },
    {
      type: 'divider'
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Week ending ${new Date().toLocaleDateString('en-IN')}`
        }
      ]
    }
  ];
}

/**
 * Create a simple message with formatting
 * @param {string} text - Message text
 * @param {string} type - Message type (success, warning, error, info)
 * @returns {Object} Formatted message
 */
function createMessage(text, type = 'info') {
  const icons = {
    success: '✅',
    warning: '⚠️',
    error: '❌',
    info: 'ℹ️'
  };

  return {
    text: `${icons[type] || icons.info} ${text}`
  };
}

/**
 * Format help message
 * @returns {Object} Help message blocks
 */
function formatHelpMessage() {
  return {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🤖 AI Boss - Command Reference',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Available Commands:*'
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '`/login` or just say "here" - Mark attendance for the day\n' +
                '`/tasks` - View your daily tasks\n' +
                '`/progress <update>` - Submit a progress update\n' +
                '`/done` - Mark all tasks as complete\n' +
                '`/status` - Check your current status\n' +
                '`/help` - Show this help message'
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Natural Language:*\nYou can also just talk to me naturally! For example:\n' +
                '• "I completed the cold calls"\n' +
                '• "Progress update: finished 20 emails"\n' +
                '• "What should I do today?"'
        }
      }
    ]
  };
}

/**
 * Get user info from Slack
 * @param {Object} app - Slack app instance
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User info
 */
async function getUserInfo(app, userId) {
  try {
    const result = await app.client.users.info({
      user: userId
    });
    return result.user;
  } catch (error) {
    console.error('Error getting user info:', error);
    return null;
  }
}

/**
 * Get channel members
 * @param {Object} app - Slack app instance
 * @param {string} channelId - Channel ID
 * @returns {Promise<Array>} Array of user IDs
 */
async function getChannelMembers(app, channelId) {
  try {
    const result = await app.client.conversations.members({
      channel: channelId
    });
    return result.members || [];
  } catch (error) {
    console.error('Error getting channel members:', error);
    return [];
  }
}

/**
 * Send DM to user
 * @param {Object} app - Slack app instance
 * @param {string} userId - User ID
 * @param {Object} message - Message object (text or blocks)
 * @returns {Promise<Object>} Send result
 */
async function sendDM(app, userId, message) {
  try {
    // Open DM channel
    const dm = await app.client.conversations.open({
      users: userId
    });

    // Send message
    const result = await app.client.chat.postMessage({
      channel: dm.channel.id,
      ...message
    });

    return result;
  } catch (error) {
    console.error('Error sending DM:', error);
    return null;
  }
}

/**
 * Post message to channel
 * @param {Object} app - Slack app instance
 * @param {string} channelId - Channel ID
 * @param {Object} message - Message object
 * @returns {Promise<Object>} Post result
 */
async function postToChannel(app, channelId, message) {
  try {
    const result = await app.client.chat.postMessage({
      channel: channelId,
      ...message
    });
    return result;
  } catch (error) {
    console.error('Error posting to channel:', error);
    return null;
  }
}

/**
 * Add reaction to message
 * @param {Object} app - Slack app instance
 * @param {string} channel - Channel ID
 * @param {string} timestamp - Message timestamp
 * @param {string} emoji - Emoji name (without colons)
 */
async function addReaction(app, channel, timestamp, emoji) {
  try {
    await app.client.reactions.add({
      channel,
      timestamp,
      name: emoji
    });
  } catch (error) {
    console.error('Error adding reaction:', error);
  }
}

/**
 * Format intern status
 * @param {Object} intern - Intern data
 * @returns {string} Formatted status
 */
function formatInternStatus(intern) {
  const today = new Date().toISOString().split('T')[0];
  const attendance = intern.attendance?.[today] ? '✅ Logged in' : '❌ Not logged in';
  const tasksCount = intern.currentTasks?.length || 0;
  const progressCount = intern.progressUpdates?.[today]?.length || 0;

  return `*Status for ${intern.name}:*\n` +
         `• Attendance: ${attendance}\n` +
         `• Tasks: ${tasksCount} assigned\n` +
         `• Progress updates: ${progressCount}\n` +
         `• Completion rate: ${intern.completionRate || 0}%`;
}

/**
 * Create admin directive confirmation message
 * @param {string} action - Action performed
 * @param {Object} details - Action details
 * @returns {Object} Confirmation message
 */
function createAdminConfirmation(action, details) {
  const messages = {
    ADD_INTERN: `✅ Added intern: *${details.name}* (${details.role})`,
    REMOVE_INTERN: `✅ Removed intern: *${details.name}*`,
    UPDATE_TONE: `✅ Updated tone to: *${details.tone}*`,
    UPLOAD_DATA: `✅ Data uploaded and integrated into memory`,
    GET_STATS: 'Fetching stats...'
  };

  return {
    text: messages[action] || '✅ Directive processed'
  };
}

/**
 * Parse user mention from text
 * @param {string} text - Message text
 * @returns {Array} Array of user IDs
 */
function parseUserMentions(text) {
  const mentionRegex = /<@([A-Z0-9]+)>/g;
  const mentions = [];
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1]);
  }

  return mentions;
}

/**
 * Escape text for Slack markdown
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeSlackText(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = {
  formatTasksAsBlocks,
  formatDailySummaryBlocks,
  formatWeeklyReviewBlocks,
  createMessage,
  formatHelpMessage,
  getUserInfo,
  getChannelMembers,
  sendDM,
  postToChannel,
  addReaction,
  formatInternStatus,
  createAdminConfirmation,
  parseUserMentions,
  escapeSlackText
};
