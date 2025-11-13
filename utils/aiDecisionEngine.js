/**
 * AI Decision Engine V2
 * Pure AI intelligence - NO keyword hints, NO hardcoded rules
 *
 * Uses GPT-4 with FULL context to decide intelligently:
 * - Analyzes conversation history and patterns
 * - Understands semantic meaning, not keywords
 * - Makes context-aware decisions
 * - Learns from past interactions
 */

const OpenAI = require('openai');
const conversationMemory = require('./conversationMemory-v2');

// Lazy-load OpenAI client
let openai = null;
function getOpenAI() {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openai;
}

/**
 * Analyze a message and decide if/how to respond
 * Pure AI decision making with full context awareness
 */
async function analyzeMessage(params) {
  const {
    message,
    sender,
    internProfile,
    channelInfo,
    recentMessages,
    allInterns,
    rules,
    isAdmin,
    conversationContext
  } = params;

  try {
    // Different prompts for admin vs regular users
    const isDM = message.channel_type === 'im' || message.channel.startsWith('D');

    if (isAdmin && isDM) {
      return await analyzeAdminDM(params);
    }

    if (isAdmin) {
      return await analyzeAdminMessage(params);
    }

    return await analyzeRegularMessage(params);

  } catch (error) {
    console.error('Error in AI decision engine:', error);

    // Fallback to safe default
    return {
      shouldRespond: false,
      responseType: 'silent',
      reasoning: 'Error in decision engine, staying silent',
      response: null,
      action: null
    };
  }
}

/**
 * Analyze admin DM - should ALWAYS respond
 */
async function analyzeAdminDM(params) {
  const { message, conversationContext, allInterns, rules } = params;

  const prompt = buildContextPrompt({
    ...params,
    promptType: 'admin_dm'
  });

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: `You are the AI Boss assistant in direct conversation with your admin/boss.

**Core Principles:**
- ALWAYS respond to admin messages in DMs - never stay silent
- You are the admin's executive assistant for managing their team
- Execute directives immediately and confirm completion
- Be professional, efficient, and helpful

**Your Capabilities:**
- Manage team members (interns) across different channels
- Forward messages to team channels or individuals
- Assign and track tasks
- Monitor attendance and performance
- Send status updates and reports

**Decision Making:**
Analyze the admin's message and determine:
1. What does the admin want you to do?
2. Is this a directive to message someone/a team?
3. Is this asking for status/information?
4. Should you acknowledge or act?

**Output Format:**
Return JSON with this structure:
{
  "shouldRespond": true (ALWAYS true for admin DMs),
  "responseType": "admin_directive"|"status_update"|"acknowledgment"|"information_request",
  "reasoning": "brief explanation of your understanding",
  "response": "your message back to admin",
  "action": "send_to_channel"|"assign_tasks"|"status_report"|null,
  "messageToForward": "if forwarding, the cleaned message to send",
  "targetChannel": "if messaging a team, which team: sales|outreach|shitposters",
  "targetUser": "if messaging individual, their name or ID"
}

**Understanding Intent:**
- If admin says variations of "tell X", "message X", "inform X", "remind X" → action: "send_to_channel"
- Extract WHO (team/person) and WHAT (the message) naturally from context
- Don't require exact keywords - understand meaning

**Example:**
Admin: "inform the outreach team they have a meeting at 5pm"
→ action: "send_to_channel", targetChannel: "outreach", messageToForward: "you have a meeting at 5pm"

Admin: "tell ashutosh he did great work today"
→ action: "send_to_channel", targetUser: "ashutosh", messageToForward: "you did great work today"
`
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.7,
    response_format: { type: "json_object" }
  });

  const decision = JSON.parse(completion.choices[0].message.content);
  decision.shouldRespond = true; // Force response for admin DMs

  console.log('🧠 AI Decision (Admin DM):', decision);
  return decision;
}

/**
 * Analyze admin message in channel
 */
async function analyzeAdminMessage(params) {
  const { message, conversationContext } = params;

  const prompt = buildContextPrompt({
    ...params,
    promptType: 'admin_channel'
  });

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: `You are the AI Boss observing admin's message in a team channel.

**Core Principles:**
- Admin is your boss - their messages have high priority
- Respond when admin addresses you or asks questions
- Execute directives immediately
- Stay silent if admin is just chatting with team

**Decision Making:**
Determine:
1. Is admin talking to YOU (the bot)?
2. Is admin giving you a directive?
3. Is this admin just talking to team members?

**Output JSON:**
{
  "shouldRespond": true/false,
  "responseType": "admin_directive"|"acknowledgment"|"silent",
  "reasoning": "why you made this decision",
  "response": "your message (or null)",
  "action": "relevant action or null"
}
`
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.7,
    response_format: { type: "json_object" }
  });

  const decision = JSON.parse(completion.choices[0].message.content);
  console.log('🧠 AI Decision (Admin Channel):', decision);
  return decision;
}

/**
 * Analyze regular message from intern/team member
 * True contextual intelligence - NO keyword hints
 */
async function analyzeRegularMessage(params) {
  const { message, conversationContext } = params;

  const prompt = buildContextPrompt({
    ...params,
    promptType: 'regular'
  });

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: `You are the AI Boss decision engine. You monitor workplace communication and decide when to take action.

**Your Role:**
- Monitor all messages in team channels
- Track attendance, tasks, and performance
- Respond when appropriate based on CONTEXT, not keywords
- Be proactive but not annoying
- Understand natural language and intent

**Core Capabilities:**
1. **Attendance Tracking:** Recognize when someone is checking in/arriving for work
2. **Task Management:** Identify task completions, progress updates, requests for work
3. **Help Requests:** Detect when someone needs assistance
4. **Escalations:** Recognize when something needs admin/boss attention
5. **Social Intelligence:** Understand when to engage vs when to stay silent

**Context Awareness:**
- You have access to FULL conversation history with this user
- You can see their past behavior patterns
- You know their current tasks and attendance status
- You have semantic context from similar past interactions
- USE ALL THIS CONTEXT to make intelligent decisions

**Decision Framework:**
Ask yourself:
1. What is the INTENT behind this message? (not just keywords)
2. Is this person:
   - Checking in for work?
   - Reporting task completion/progress?
   - Asking for help or tasks?
   - Trying to reach the boss/admin?
   - Just chatting with colleagues?
   - Asking ME a direct question?
3. Based on context and history, should I respond?
4. What action, if any, should I take?

**Understanding Without Keywords:**
- "here", "present", "arrived", "good morning" (if first message of day) → might be checking in
- "done", "finished", "completed" + task context → might be task completion
- "can you", "help me", "stuck", "how do I" → help request
- "tell boss", "tell him", "inform admin", asking to pass message → escalation
- Mentioning me by name or asking me questions → direct engagement

But DON'T rely on keywords alone - UNDERSTAND CONTEXT!

**Output JSON:**
{
  "shouldRespond": true/false,
  "responseType": "check_in"|"task_update"|"help_request"|"escalation"|"direct_question"|"social_chat"|"silent",
  "reasoning": "detailed explanation of your decision based on context",
  "response": "your message (or null if silent)",
  "action": "login"|"assign_tasks"|"mark_progress"|"request_screenshot"|"send_to_admin"|null
}

**Action Meanings:**
- "login": Person is checking in for the day (mark attendance)
- "assign_tasks": Person needs tasks assigned to them
- "mark_progress": Person is updating task progress
- "request_screenshot": Person claims task completion, ask for proof
- "send_to_admin": Message needs to be forwarded to boss/admin

**Important:**
- Don't respond to EVERY message - know when to stay silent
- If someone directly addresses you or asks you a question, ALWAYS respond
- Use conversation history to understand patterns and context
- Reference past interactions naturally when relevant
- Be helpful and proactive, but not intrusive
`
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.7,
    response_format: { type: "json_object" }
  });

  const decision = JSON.parse(completion.choices[0].message.content);
  console.log('🧠 AI Decision:', {
    shouldRespond: decision.shouldRespond,
    type: decision.responseType,
    reasoning: decision.reasoning,
    action: decision.action
  });

  return decision;
}

/**
 * Build context-rich prompt for AI analysis
 * Includes ALL available context without keyword hints
 */
function buildContextPrompt(params) {
  const {
    message,
    sender,
    internProfile,
    channelInfo,
    recentMessages,
    allInterns,
    rules,
    isAdmin,
    conversationContext,
    promptType
  } = params;

  const now = new Date();
  const timeOfDay = now.getHours();
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });

  let prompt = `# MESSAGE TO ANALYZE\n\n`;
  prompt += `**Sender:** ${sender.name} ${isAdmin ? '(ADMIN - your boss)' : '(Team Member)'}\n`;
  prompt += `**User ID:** ${sender.id}\n`;
  prompt += `**Channel:** ${channelInfo.name} (${channelInfo.id})\n`;
  prompt += `**Time:** ${now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST\n`;
  prompt += `**Hour:** ${timeOfDay}:00 (${timeOfDay < 12 ? 'Morning' : timeOfDay < 17 ? 'Afternoon' : 'Evening'})\n`;
  prompt += `**Day:** ${dayOfWeek}\n\n`;

  prompt += `**Message Text:**\n"${message.text}"\n\n`;

  if (message.thread_ts) {
    prompt += `**Note:** This is a thread reply\n\n`;
  }

  prompt += `---\n\n`;

  // Conversation history
  if (conversationContext?.history?.userConversations) {
    prompt += `# CONVERSATION HISTORY WITH THIS USER\n\n`;

    if (conversationContext.history.userConversations.length > 0) {
      prompt += `**Recent Interactions:**\n\n`;

      conversationContext.history.userConversations.slice(-5).forEach(conv => {
        const time = new Date(conv.timestamp).toLocaleString('en-IN', { timeStyle: 'short' });
        prompt += `[${time}] **${conv.userName}:** "${conv.message}"\n`;
        if (conv.botResponse) {
          prompt += `   → **You responded:** "${conv.botResponse}"\n`;
        }
        if (conv.actionsTaken?.length > 0) {
          prompt += `   → **Actions taken:** ${conv.actionsTaken.join(', ')}\n`;
        }
        prompt += `\n`;
      });

      const patterns = conversationContext.patterns;
      prompt += `**Behavior Patterns:**\n`;
      prompt += `- Total interactions: ${patterns.totalInteractions}\n`;
      if (patterns.commonIntents?.length > 0) {
        prompt += `- Common intents: ${patterns.commonIntents.join(', ')}\n`;
      }
      if (patterns.preferredTimeOfDay) {
        prompt += `- Usually active around: ${patterns.preferredTimeOfDay}:00\n`;
      }
      prompt += `- Engagement level: ${patterns.engagementLevel}\n`;
      if (patterns.lastInteraction) {
        prompt += `- Last seen: ${new Date(patterns.lastInteraction).toLocaleString('en-IN')}\n`;
      }
    } else {
      prompt += `**First interaction with this user**\n`;
    }

    prompt += `\n`;
  }

  // Semantic context from vector search
  if (conversationContext?.semanticContext?.userContext?.length > 0) {
    prompt += `# SEMANTICALLY SIMILAR PAST INTERACTIONS\n\n`;
    prompt += `Found ${conversationContext.semanticContext.userContext.length} similar past conversations:\n\n`;

    conversationContext.semanticContext.userContext.slice(0, 3).forEach((ctx, idx) => {
      prompt += `${idx + 1}. "${ctx.message_text}"\n`;
      if (ctx.bot_response) {
        prompt += `   → You responded: "${ctx.bot_response}"\n`;
      }
      prompt += `   (similarity: ${(ctx.score * 100).toFixed(0)}%)\n\n`;
    });
  }

  prompt += `---\n\n`;

  // Intern profile
  if (internProfile) {
    prompt += `# TEAM MEMBER PROFILE\n\n`;
    prompt += `**Name:** ${internProfile.name}\n`;
    prompt += `**Role:** ${internProfile.role}\n`;
    prompt += `**Assigned Channel:** ${internProfile.channelId}\n`;
    prompt += `**Member Since:** ${new Date(internProfile.joinDate).toLocaleDateString()}\n`;
    prompt += `**Status:** ${internProfile.active ? 'Active' : 'Inactive'}\n\n`;

    const today = now.toISOString().split('T')[0];
    const hasAttendance = internProfile.attendance[today];
    prompt += `**Today's Status:**\n`;
    if (hasAttendance) {
      const loginTime = new Date(hasAttendance.timestamp).toLocaleTimeString('en-IN');
      prompt += `✅ Checked in at ${loginTime}\n\n`;
    } else {
      prompt += `❌ Not checked in yet\n\n`;
    }

    if (internProfile.currentTasks?.length > 0) {
      prompt += `**Current Tasks:** (${internProfile.currentTasks.length})\n`;
      internProfile.currentTasks.forEach((t, i) => {
        prompt += `${i + 1}. ${t.title} [${t.priority}] - ${t.completed ? '✅ Done' : '⏳ Pending'}\n`;
      });
      prompt += `\n`;
    }

    prompt += `**Performance:**\n`;
    prompt += `- Completion Rate: ${internProfile.completionRate}%\n`;
    prompt += `- Attendance Rate: ${internProfile.stats?.attendanceRate || 0}%\n`;
    prompt += `- Total Tasks: ${internProfile.stats?.totalTasksAssigned || 0}\n`;
    prompt += `- Completed: ${internProfile.stats?.totalTasksCompleted || 0}\n\n`;
  }

  prompt += `---\n\n`;

  // Channel context
  if (conversationContext?.history?.channelContext?.length > 0) {
    prompt += `# RECENT CHANNEL ACTIVITY\n\n`;
    conversationContext.history.channelContext.slice(-3).forEach(conv => {
      const time = new Date(conv.timestamp).toLocaleTimeString('en-IN');
      const msgPreview = conv.message.substring(0, 100);
      prompt += `[${time}] ${conv.userName}: "${msgPreview}${conv.message.length > 100 ? '...' : ''}"\n`;
    });
    prompt += `\n`;
  }

  prompt += `---\n\n`;

  // Team overview
  if (allInterns?.length > 0) {
    prompt += `# ALL TEAM MEMBERS\n\n`;
    allInterns.forEach(intern => {
      prompt += `- ${intern.name} (${intern.role}) - Active: ${intern.active}, Attendance: ${intern.stats?.attendanceRate || 0}%\n`;
    });
    prompt += `\n---\n\n`;
  }

  // Workplace rules
  if (rules?.rules) {
    prompt += `# WORKPLACE CONTEXT\n\n`;
    prompt += `**Rules:**\n`;
    rules.rules.forEach((r, i) => {
      prompt += `${i + 1}. ${r}\n`;
    });
    prompt += `\n`;

    prompt += `**Current Tone:** ${rules.tone}\n\n`;

    if (rules.customDirectives?.length > 0) {
      prompt += `**Recent Directives:**\n`;
      rules.customDirectives.slice(-3).forEach(d => {
        prompt += `- ${d.text}\n`;
      });
      prompt += `\n`;
    }
  }

  prompt += `---\n\n`;

  // Decision task
  prompt += `# YOUR TASK\n\n`;
  prompt += `Analyze this message using ALL the context above.\n\n`;
  prompt += `Consider:\n`;
  prompt += `1. What is the sender's INTENT? (understand meaning, not just words)\n`;
  prompt += `2. Does their conversation history provide relevant context?\n`;
  prompt += `3. Are there similar past interactions that inform how to respond?\n`;
  prompt += `4. Based on time of day, their status, and history - what's appropriate?\n`;
  prompt += `5. Should you respond, stay silent, or take action?\n\n`;

  prompt += `Return your decision as JSON.`;

  return prompt;
}

module.exports = {
  analyzeMessage
};
