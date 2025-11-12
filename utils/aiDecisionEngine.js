/**
 * AI Decision Engine
 * Uses GPT-4 to intelligently decide when and how to respond to messages
 * Analyzes context, memory, intern profiles, and determines appropriate actions
 */

const OpenAI = require('openai');

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
 * @param {Object} params - Analysis parameters
 * @returns {Object} Decision object with shouldRespond, responseType, response
 */
async function analyzeMessage(params) {
  const {
    message,          // The Slack message object
    sender,           // User info who sent it
    internProfile,    // Intern's full profile if they're in the system
    channelInfo,      // Channel details
    recentMessages,   // Recent channel history for context
    allInterns,       // All intern profiles
    rules,            // Current rules and directives
    isAdmin           // Whether sender is admin
  } = params;

  try {
    // Admin DMs should ALWAYS get a response
    // Check multiple ways: channel_type or channel ID starts with 'D'
    const isDM = message.channel_type === 'im' || message.channel.startsWith('D');

    if (isAdmin && isDM) {
      console.log('👨‍💼 Admin DM - forcing response');

      const prompt = buildAnalysisPrompt(params);
      const completion = await getOpenAI().chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: `You are the AI Boss assistant in direct message with your admin/boss.
CRITICAL: You MUST ALWAYS respond to admin messages in DMs. Never stay silent.

Your admin is giving you instructions, asking questions, or managing the team.
- Always acknowledge their messages
- Execute their directives
- Provide status updates
- Be helpful and responsive
- Use a professional but friendly tone

Output your decision as JSON with this structure:
{
  "shouldRespond": true (ALWAYS true for admin DMs),
  "responseType": "admin_directive"|"status_update"|"acknowledgment",
  "reasoning": "why you're responding this way",
  "response": "your actual response message",
  "action": "send_to_channel"|"assign_tasks"|null
}

IMPORTANT: If admin says things like "tell X to do Y", "message X about Y", "inform X that Y", "remind X to Y" - set action to "send_to_channel"`
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

    // Even if not a DM, admin messages should get high priority
    if (isAdmin) {
      console.log('👨‍💼 Admin message in channel - will prioritize response');
    }

    const prompt = buildAnalysisPrompt(params);

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: `You are the AI Boss decision engine. You monitor all workplace communication and decide when to take action.

Your role:
- Monitor all messages in team channels
- Track intern attendance, tasks, and performance
- Respond intelligently based on context, not just keywords
- BE PROACTIVE - respond immediately to check-ins, task completions, help requests
- Manage interns professionally but with personality
- Execute admin directives instantly

Critical behaviors:
- CHECK-INS: ALWAYS respond instantly when someone checks in
  * Trigger words: "log in", "login", "check in", "here", "present", "attendance", "good morning" (if first message of day)
  * Action: "login" (REQUIRED)
- TASK COMPLETIONS: When someone says they're done, ask for screenshot proof
- HELP REQUESTS: Respond immediately when someone asks for help
- LATE CHECK-INS: If someone checks in after 10:30 AM, acknowledge but note they're late
- ESCALATIONS: If someone says "tell the boss", "inform boss", "contact admin" → action: "send_to_admin"

Decision framework:
1. Is this a CHECK-IN? (highest priority - respond IMMEDIATELY with action: "login")
2. Is this directed at you? (mention, command, clear question to bot)
3. Is this work-related and requires your attention? (task updates, help requests)
4. Is this admin giving you a directive?
5. Is this general chatter that doesn't need your input?

Output your decision as JSON with this exact structure:
{
  "shouldRespond": true/false,
  "responseType": "command"|"task_update"|"admin_directive"|"encouragement"|"reminder"|"silent"|"check_in",
  "reasoning": "brief explanation of your decision",
  "response": "the actual message to send (or null if silent)",
  "action": "login"|"assign_tasks"|"mark_progress"|"request_screenshot"|"send_to_admin"|null
}

Action guide:
- "login": Someone is checking in (words: "check in", "here", "present", "login", "checking in")
- "request_screenshot": Someone claims task is done, ask for proof
- "mark_progress": Someone updating task progress
- "assign_tasks": Need to give someone tasks
- "send_to_admin": Urgent issue needs boss attention`
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
      reasoning: decision.reasoning
    });

    return decision;
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
 * Build the context-rich prompt for AI analysis
 */
function buildAnalysisPrompt(params) {
  const {
    message,
    sender,
    internProfile,
    channelInfo,
    recentMessages,
    allInterns,
    rules,
    isAdmin
  } = params;

  const now = new Date();
  const timeOfDay = now.getHours();
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });

  return `# MESSAGE TO ANALYZE

**Sender:** ${sender.name} ${isAdmin ? '(ADMIN - your boss)' : '(Intern)'}
**User ID:** ${sender.id}
**Channel:** ${channelInfo.name} (${channelInfo.id})
**Time:** ${now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST (${timeOfDay}:00 - ${timeOfDay < 12 ? 'Morning' : timeOfDay < 17 ? 'Afternoon' : 'Evening'})
**Day:** ${dayOfWeek}

**Message Text:**
"${message.text}"

${message.thread_ts ? '**Note:** This is a thread reply' : ''}

---

# INTERN PROFILE
${internProfile ? `
**Name:** ${internProfile.name}
**Role:** ${internProfile.role}
**Assigned Channel:** ${internProfile.channelId}
**Join Date:** ${new Date(internProfile.joinDate).toLocaleDateString()}
**Active:** ${internProfile.active ? 'Yes' : 'No'}

**Today's Attendance:**
${internProfile.attendance[now.toISOString().split('T')[0]] ?
  `✅ Logged in at ${new Date(internProfile.attendance[now.toISOString().split('T')[0]].timestamp).toLocaleTimeString('en-IN')}` :
  '❌ Not logged in yet'}

**Current Tasks:** (${internProfile.currentTasks.length})
${internProfile.currentTasks.map((t, i) =>
  `${i + 1}. ${t.title} [${t.priority}] - ${t.completed ? '✅ Done' : '⏳ Pending'}`
).join('\n') || 'None assigned'}

**Completed Tasks Today:** ${internProfile.completedTasks.filter(t => {
  const completedDate = new Date(t.completedAt).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];
  return completedDate === today;
}).length}

**Stats:**
- Total Tasks Assigned: ${internProfile.stats.totalTasksAssigned}
- Total Completed: ${internProfile.stats.totalTasksCompleted}
- Completion Rate: ${internProfile.completionRate}%
- Attendance Rate: ${internProfile.stats.attendanceRate}%
` : '**Not registered as intern**'}

---

# RECENT CHANNEL HISTORY (Last 5 messages)
${recentMessages.map(m => `[${new Date(m.ts * 1000).toLocaleTimeString('en-IN')}] ${m.user_name || 'Unknown'}: ${m.text}`).join('\n')}

---

# WORKPLACE RULES & CONTEXT
${rules.rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

**Current Tone:** ${rules.tone}

**Custom Directives:**
${rules.customDirectives.slice(-3).map(d => `- ${d.text}`).join('\n') || 'None'}

---

# ALL TEAM MEMBERS
${allInterns.map(intern =>
  `- ${intern.name} (${intern.role}) - Channel: ${intern.channelId} - Active: ${intern.active} - Attendance: ${intern.stats.attendanceRate}%`
).join('\n')}

---

# YOUR DECISION TASK

Analyze this message and decide:

1. **Should you respond?** Consider:
   - Is this directed at you explicitly? (@mention, "/login", "my tasks", etc.)
   - Is this work-related and needs your attention? (attendance, task completion, help request)
   - Is this admin giving you a directive? (tell X to do Y, assign tasks, etc.)
   - Is this just general chat that doesn't need your input?
   - Is the intern in their correct assigned channel?

2. **What type of response?**
   - "command" - Direct bot command (login, tasks, help)
   - "task_update" - Intern reporting progress or completion
   - "admin_directive" - Admin telling you to do something
   - "encouragement" - Appropriate supportive message
   - "reminder" - Gentle nudge about attendance/tasks
   - "silent" - No response needed

3. **What action to take?**
   - "login" - Mark attendance
   - "assign_tasks" - Generate and assign new tasks
   - "mark_progress" - Record task progress
   - "send_to_admin" - Notify admin of something important
   - null - No action needed

4. **What to say?**
   - If responding, craft an appropriate message
   - Match the current tone setting: ${rules.tone}
   - Be professional but personable
   - Reference their specific situation
   - If silent, set response to null

**Important Rules:**
- Only respond in the intern's ASSIGNED channel (${internProfile?.channelId || 'N/A'})
- If message is in wrong channel, tell them to use their assigned channel
- Don't respond to every message - know when to stay quiet
- Admin can message anywhere, interns only in their channels
- Be contextually aware - consider time of day, their current tasks, recent activity

Return your decision as JSON.`;
}

/**
 * Simplified quick decision for obvious cases (fallback)
 * @param {Object} message - Slack message
 * @param {string} botUserId - Bot's user ID
 * @returns {string|null} Quick decision type or null if needs AI analysis
 */
function quickDecision(message, botUserId) {
  const text = (message.text || '').toLowerCase();

  // Definite bot commands
  if (text.includes(`<@${botUserId}>`) ||
      text.startsWith('/login') ||
      text.startsWith('/tasks') ||
      text.startsWith('/help') ||
      text.includes('my tasks') ||
      text.includes('aiboss')) {
    return 'COMMAND';
  }

  // Ignore bot's own messages
  if (message.bot_id) {
    return 'IGNORE';
  }

  // Needs AI analysis
  return null;
}

module.exports = {
  analyzeMessage,
  quickDecision
};
