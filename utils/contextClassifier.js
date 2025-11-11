/**
 * Context Classifier
 * Determines the intent and context of Slack messages
 * Classifies messages into: INTERN_TO_BOSS, INTERN_TO_BOT, ADMIN_DIRECTIVE, GENERAL_CHAT
 */

const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

// Bot command patterns
const BOT_COMMANDS = [
  '/login',
  '/logout',
  '/progress',
  '/done',
  '/help',
  '/tasks',
  '/status',
  '/summary'
];

const BOT_KEYWORDS = [
  'aiboss',
  'ai boss',
  'my tasks',
  'my task',
  'what are my',
  'show me my',
  'login',
  'logged in',
  'here',
  'present',
  'attendance',
  'progress',
  'completed',
  'finished',
  'done with'
];

/**
 * Classify the intent of a message
 * @param {Object} message - Slack message object
 * @param {string} botUserId - The bot's user ID
 * @returns {string} Classification type
 */
function classifyIntent(message, botUserId) {
  const { user, text, channel_type, channel } = message;
  const lowerText = (text || '').toLowerCase();

  // Get monitored channels from env
  const monitoredChannels = [
    process.env.SALES_CHANNEL_ID,
    process.env.OUTREACH_CHANNEL_ID,
    process.env.SHITPOSTERS_CHANNEL_ID
  ].filter(Boolean);

  const isMonitoredChannel = monitoredChannels.includes(channel);

  // 1. Bot mention - directly mentioned in message (highest priority)
  if (text && text.includes(`<@${botUserId}>`)) {
    return 'INTERN_TO_BOT';
  }

  // 2. Bot command - starts with a slash command (works for everyone including admin)
  const startsWithCommand = BOT_COMMANDS.some(cmd => lowerText.startsWith(cmd));
  if (startsWithCommand) {
    return 'INTERN_TO_BOT';
  }

  // 3. Bot keyword - contains bot-related keywords (works for everyone including admin)
  const containsBotKeyword = BOT_KEYWORDS.some(keyword => lowerText.includes(keyword));
  if (containsBotKeyword) {
    return 'INTERN_TO_BOT';
  }

  // 4. Messages in monitored channels - REMOVED broad keyword matching
  // The bot will only respond when explicitly invoked via:
  // - Direct mention (@AIBoss)
  // - Slash commands (/login, /tasks, etc.)
  // - Bot keywords (my tasks, aiboss, etc.)
  // This prevents the bot from jumping into every conversation mentioning work-related words
  // Channel verification happens in handleInternCommand() to ensure intern is in their assigned channel

  // 5. Admin-specific handling (after bot commands are checked)
  if (user === ADMIN_USER_ID) {
    if (channel_type === 'im') {
      // Check if it's an admin directive or just using the bot
      if (isAdminDirective(lowerText)) {
        return 'ADMIN_DIRECTIVE';
      }
      // Admin using bot as regular user
      return 'INTERN_TO_BOT';
    }
    // Admin talking in team channels is just supervision, not a directive
    return 'ADMIN_MESSAGE';
  }

  // 6. Direct message to bot (DMs)
  if (channel_type === 'im') {
    // Only admin can DM the bot
    // Interns should use their assigned channels
    return 'BLOCKED_DM';
  }

  // 7. Mentions admin - likely talking to the boss
  if (text && text.includes(`<@${ADMIN_USER_ID}>`)) {
    return 'INTERN_TO_BOSS';
  }

  // 8. Reply to admin message
  if (message.thread_ts && message.parent_user_id === ADMIN_USER_ID) {
    return 'INTERN_TO_BOSS';
  }

  // 9. Default - general team chat
  return 'GENERAL_CHAT';
}

/**
 * Check if message from admin is a directive
 * @param {string} lowerText - Lowercase message text
 * @returns {boolean}
 */
function isAdminDirective(lowerText) {
  const directivePatterns = [
    'add intern',
    'remove intern',
    'delete intern',
    'update tone',
    'change tone',
    'upload data',
    'add context',
    'remember',
    'stats',
    'report',
    'summary',
    'tell',
    'inform',
    'notify',
    'message',
    'ask',
    'remind'
  ];

  return directivePatterns.some(pattern => lowerText.includes(pattern));
}

/**
 * Extract command and parameters from bot-directed messages
 * @param {string} text - Message text
 * @returns {Object} Command details
 */
function parseCommand(text) {
  const lowerText = text.toLowerCase().trim();

  // Check for slash commands
  for (const cmd of BOT_COMMANDS) {
    if (lowerText.startsWith(cmd)) {
      const params = text.slice(cmd.length).trim();
      return {
        command: cmd,
        parameters: params,
        raw: text
      };
    }
  }

  // Check for natural language patterns
  if (lowerText.includes('login') || lowerText.includes('logged in') || lowerText.includes('here')) {
    return { command: '/login', parameters: '', raw: text };
  }

  if (lowerText.includes('progress') || lowerText.includes('update')) {
    // Extract everything after the keyword as the progress update
    const progressMatch = text.match(/(?:progress|update)[:\s-]*(.*)/i);
    return {
      command: '/progress',
      parameters: progressMatch ? progressMatch[1].trim() : '',
      raw: text
    };
  }

  if (lowerText.includes('done') || lowerText.includes('complete') || lowerText.includes('finish')) {
    return { command: '/done', parameters: text, raw: text };
  }

  if (lowerText.includes('help')) {
    return { command: '/help', parameters: '', raw: text };
  }

  if (lowerText.includes('tasks') || lowerText.includes('what should')) {
    return { command: '/tasks', parameters: '', raw: text };
  }

  // Default - treat as general inquiry to bot
  return {
    command: null,
    parameters: text,
    raw: text
  };
}

/**
 * Parse admin directive from message
 * @param {string} text - Admin message text
 * @returns {Object} Directive details
 */
function parseAdminDirective(text) {
  const lowerText = text.toLowerCase().trim();

  // Add intern
  if (lowerText.includes('add intern') || lowerText.includes('new intern')) {
    const match = text.match(/add\s+intern\s+(\S+)(?:\s+(\w+))?/i);
    if (match) {
      return {
        action: 'ADD_INTERN',
        name: match[1],
        role: match[2] || 'sales',
        raw: text
      };
    }
  }

  // Remove intern
  if (lowerText.includes('remove intern') || lowerText.includes('delete intern')) {
    const match = text.match(/remove\s+intern\s+(\S+)/i);
    if (match) {
      return {
        action: 'REMOVE_INTERN',
        name: match[1],
        raw: text
      };
    }
  }

  // Update tone
  if (lowerText.includes('update tone') || lowerText.includes('change tone')) {
    const match = text.match(/tone\s+(?:to\s+)?(\w+)/i);
    if (match) {
      return {
        action: 'UPDATE_TONE',
        tone: match[1],
        raw: text
      };
    }
  }

  // Upload data / add context
  if (lowerText.includes('upload data') || lowerText.includes('add context') || lowerText.includes('remember')) {
    return {
      action: 'UPLOAD_DATA',
      data: text,
      raw: text
    };
  }

  // Get stats / report
  if (lowerText.includes('stats') || lowerText.includes('report') || lowerText.includes('summary')) {
    return {
      action: 'GET_STATS',
      raw: text
    };
  }

  // Agentic directives - tell/inform/notify/ask someone to do something
  if (lowerText.includes('tell') || lowerText.includes('inform') || lowerText.includes('notify') ||
      lowerText.includes('message') || lowerText.includes('ask') || lowerText.includes('remind')) {
    // Pattern: "tell [name] to [action]"
    const tellMatch = text.match(/(?:tell|inform|notify|message|ask|remind)\s+(\S+)\s+(?:to\s+)?(.+)/i);
    if (tellMatch) {
      return {
        action: 'AGENTIC_MESSAGE',
        targetName: tellMatch[1],
        message: tellMatch[2].trim(),
        raw: text
      };
    }
  }

  // General directive - store as context
  return {
    action: 'GENERAL_DIRECTIVE',
    content: text,
    raw: text
  };
}

/**
 * Determine if message requires bot action
 * @param {string} intent - The classified intent
 * @returns {boolean}
 */
function requiresAction(intent) {
  return intent === 'INTERN_TO_BOT' || intent === 'ADMIN_DIRECTIVE';
}

/**
 * Get appropriate response context based on intent
 * @param {string} intent - The classified intent
 * @returns {Object} Context for response generation
 */
function getResponseContext(intent) {
  const contexts = {
    'INTERN_TO_BOT': {
      tone: 'professional',
      expectsResponse: true,
      logImportance: 'high'
    },
    'ADMIN_DIRECTIVE': {
      tone: 'respectful',
      expectsResponse: true,
      logImportance: 'critical'
    },
    'INTERN_TO_BOSS': {
      tone: null,
      expectsResponse: false,
      logImportance: 'medium'
    },
    'ADMIN_MESSAGE': {
      tone: null,
      expectsResponse: false,
      logImportance: 'high'
    },
    'GENERAL_CHAT': {
      tone: null,
      expectsResponse: false,
      logImportance: 'low'
    }
  };

  return contexts[intent] || contexts['GENERAL_CHAT'];
}

module.exports = {
  classifyIntent,
  parseCommand,
  parseAdminDirective,
  requiresAction,
  getResponseContext
};
