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
  'bot',
  'submit',
  'update',
  'complete',
  'task',
  'attendance'
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

  // 1. Admin directive - any message from admin in DM or control channel
  if (user === ADMIN_USER_ID) {
    if (channel_type === 'im') {
      return 'ADMIN_DIRECTIVE';
    }
    // Admin talking in team channels is just supervision, not a directive
    return 'ADMIN_MESSAGE';
  }

  // 2. Direct message to bot (DMs)
  if (channel_type === 'im') {
    return 'INTERN_TO_BOT';
  }

  // 3. Bot mention - directly mentioned in message
  if (text && text.includes(`<@${botUserId}>`)) {
    return 'INTERN_TO_BOT';
  }

  // 4. Bot command - starts with a slash command
  const startsWithCommand = BOT_COMMANDS.some(cmd => lowerText.startsWith(cmd));
  if (startsWithCommand) {
    return 'INTERN_TO_BOT';
  }

  // 5. Bot keyword - contains bot-related keywords
  const containsBotKeyword = BOT_KEYWORDS.some(keyword => lowerText.includes(keyword));
  if (containsBotKeyword) {
    return 'INTERN_TO_BOT';
  }

  // 6. Mentions admin - likely talking to the boss
  if (text && text.includes(`<@${ADMIN_USER_ID}>`)) {
    return 'INTERN_TO_BOSS';
  }

  // 7. Reply to admin message
  if (message.thread_ts && message.parent_user_id === ADMIN_USER_ID) {
    return 'INTERN_TO_BOSS';
  }

  // 8. Default - general team chat
  return 'GENERAL_CHAT';
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
