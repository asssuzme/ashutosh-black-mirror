/**
 * OpenAI Helper
 * Handles all AI reasoning tasks using OpenAI API
 * - Task generation
 * - Sentiment analysis
 * - Summary generation
 * - Learning and context improvement
 */

const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');

const MODEL = 'gpt-4-turbo-preview';
const FAST_MODEL = 'gpt-3.5-turbo';

// Lazy-load OpenAI client to allow env var validation first
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
 * Load learning context from memory
 */
async function loadContext() {
  try {
    const internsPath = path.join(__dirname, '../memory/interns.json');
    const rulesPath = path.join(__dirname, '../memory/rules.json');

    const [interns, rules] = await Promise.all([
      fs.readFile(internsPath, 'utf-8').then(JSON.parse).catch(() => ({ interns: [] })),
      fs.readFile(rulesPath, 'utf-8').then(JSON.parse).catch(() => ({ tone: 'professional', rules: [] }))
    ]);

    return { interns, rules };
  } catch (error) {
    console.error('Error loading context:', error);
    return { interns: { interns: [] }, rules: { tone: 'professional', rules: [] } };
  }
}

/**
 * Generate daily tasks for an intern based on role and context
 * @param {string} role - Intern's role (sales, outreach, shitposters)
 * @param {Object} internProfile - Intern's profile with history
 * @returns {Promise<Array>} Array of tasks
 */
async function generateTasks(role, internProfile = {}) {
  const context = await loadContext();
  const { rules } = context;

  const roleTemplates = {
    sales: 'cold calling, lead qualification, CRM updates, follow-ups, pipeline management',
    outreach: 'email campaigns, social media engagement, content distribution, partnership outreach',
    shitposters: 'viral content creation, meme generation, community engagement, trend analysis'
  };

  const prompt = `You are an AI manager generating daily tasks for a ${role} intern.

Intern Profile:
- Name: ${internProfile.name || 'Unknown'}
- Recent Performance: ${internProfile.completionRate || 'N/A'}%
- Last Tasks: ${JSON.stringify(internProfile.recentTasks || [])}
- Strengths: ${internProfile.strengths || 'Not yet determined'}

Role Focus: ${roleTemplates[role] || roleTemplates.sales}

Current Rules/Guidelines:
${rules.rules?.join('\n') || 'Standard productivity expectations'}

Generate 3-5 specific, actionable tasks for today. Make them:
1. Concrete and measurable
2. Appropriate for skill level
3. Varied (not repetitive)
4. Challenging but achievable

Return ONLY a JSON array of task objects with this structure:
[
  {
    "title": "Task title",
    "description": "Detailed description",
    "priority": "high|medium|low",
    "estimatedTime": "time in minutes"
  }
]`;

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: FAST_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 800
    });

    const content = completion.choices[0].message.content.trim();
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(content);
  } catch (error) {
    console.error('Error generating tasks:', error);
    // Fallback default tasks
    return [
      {
        title: `Complete ${role} objectives`,
        description: 'Focus on your key responsibilities today',
        priority: 'high',
        estimatedTime: '240'
      }
    ];
  }
}

/**
 * Analyze sentiment and quality of a progress update
 * @param {string} update - The progress update text
 * @param {Object} internProfile - Intern's profile
 * @returns {Promise<Object>} Analysis with sentiment, quality score, feedback
 */
async function analyzeProgress(update, internProfile = {}) {
  const prompt = `Analyze this progress update from ${internProfile.name || 'an intern'}:

"${update}"

Provide analysis as JSON:
{
  "sentiment": "positive|neutral|negative",
  "qualityScore": 1-10,
  "completionIndicators": ["specific achievements mentioned"],
  "concerns": ["any red flags or issues"],
  "feedback": "Brief encouraging or constructive comment (1 sentence)",
  "needsFollowUp": boolean
}`;

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: FAST_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 300
    });

    const content = completion.choices[0].message.content.trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(content);
  } catch (error) {
    console.error('Error analyzing progress:', error);
    return {
      sentiment: 'neutral',
      qualityScore: 5,
      completionIndicators: [],
      concerns: [],
      feedback: 'Update received, keep up the work!',
      needsFollowUp: false
    };
  }
}

/**
 * Generate daily performance summary for admin
 * @param {Array} dailyData - Array of intern activity data
 * @returns {Promise<string>} Formatted summary
 */
async function generateDailySummary(dailyData) {
  const prompt = `Generate a concise daily performance summary for the boss.

Data from today:
${JSON.stringify(dailyData, null, 2)}

Create a brief, data-driven summary highlighting:
1. Overall team performance
2. Top performers (by name)
3. Concerns or lagging members
4. Notable achievements
5. Recommended actions

Keep it sharp, factual, and under 200 words. Use bullet points.`;

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      max_tokens: 500
    });

    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating summary:', error);
    return 'Unable to generate summary. Check logs for details.';
  }
}

/**
 * Generate weekly performance review
 * @param {Array} weeklyData - Array of intern data for the week
 * @returns {Promise<string>} Formatted weekly review
 */
async function generateWeeklyReview(weeklyData) {
  const prompt = `Generate a comprehensive weekly performance review.

Data for the week:
${JSON.stringify(weeklyData, null, 2)}

Create a structured review with:
1. Executive Summary
2. Individual Performance Breakdown (top 3 and bottom 3)
3. Team Trends
4. Recommendations for next week
5. Any concerning patterns

Format professionally. Include specific numbers and examples.`;

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 1200
    });

    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating weekly review:', error);
    return 'Unable to generate weekly review. Check logs for details.';
  }
}

/**
 * Learning function - analyze patterns and improve task templates
 * @param {Array} historicalData - Past performance data
 * @returns {Promise<Object>} Learning insights and recommendations
 */
async function learnFromData(historicalData) {
  const prompt = `You are an AI learning system analyzing intern performance data to improve management strategies.

Historical Data:
${JSON.stringify(historicalData, null, 2)}

Analyze patterns and provide insights as JSON:
{
  "patterns": {
    "bestTaskTypes": ["types of tasks with highest completion"],
    "optimalTaskCount": "recommended daily task count",
    "commonFailurePoints": ["where interns struggle"]
  },
  "internProfiles": [
    {
      "name": "intern name",
      "strengths": ["identified strengths"],
      "weaknesses": ["areas for improvement"],
      "optimalWorkload": "light|medium|heavy",
      "motivationStyle": "encouraging|firm|data-driven"
    }
  ],
  "recommendedRules": ["new rules or guidelines to implement"],
  "toneAdjustments": "how to adjust communication tone"
}`;

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 1000
    });

    const content = completion.choices[0].message.content.trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(content);
  } catch (error) {
    console.error('Error in learning function:', error);
    return null;
  }
}

/**
 * Generate contextual response to intern message
 * @param {string} message - Intern's message
 * @param {Object} internProfile - Intern's profile
 * @param {string} tone - Desired tone (from rules)
 * @returns {Promise<string>} Generated response
 */
async function generateResponse(message, internProfile = {}, tone = 'professional') {
  const context = await loadContext();

  const toneGuidelines = {
    professional: 'professional, encouraging, and clear',
    friendly: 'warm, supportive, and conversational',
    firm: 'direct, accountability-focused, and no-nonsense',
    motivating: 'energetic, inspiring, and achievement-oriented'
  };

  const prompt = `You are AI Boss, a ${toneGuidelines[tone] || toneGuidelines.professional} AI manager.

Intern says: "${message}"

Intern context:
- Name: ${internProfile.name || 'Unknown'}
- Recent performance: ${internProfile.completionRate || 'N/A'}%
- Current tasks: ${internProfile.currentTasks || 'Not assigned'}

Respond appropriately. Keep it brief (2-3 sentences max). Be human-like but professional.`;

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: FAST_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 150
    });

    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating response:', error);
    return 'Got it! I\'ll make note of that. Keep pushing forward! 💪';
  }
}

/**
 * Generate leaderboard from performance data
 * @param {Array} performers - Array of intern performance objects
 * @returns {string} Formatted leaderboard
 */
function generateLeaderboard(performers) {
  const sorted = performers
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const medals = ['🥇', '🥈', '🥉'];

  let leaderboard = '*🏆 TOP PERFORMERS THIS WEEK 🏆*\n\n';
  sorted.forEach((performer, index) => {
    leaderboard += `${medals[index]} *${performer.name}*\n`;
    leaderboard += `   └ Score: ${performer.score} | Tasks: ${performer.tasksCompleted} | Attendance: ${performer.attendanceRate}%\n\n`;
  });

  return leaderboard;
}

/**
 * Generate evening validation message for an intern
 * Personalized praise based on their performance
 */
async function generateValidationMessage(intern, completedToday, completionRate) {
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: FAST_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are a supportive AI manager giving end-of-day validation to your team member.
Write a SHORT (2-3 sentences) personalized message that:
- Acknowledges their work today
- Highlights specific achievements if completion rate is good
- Encourages them for tomorrow
- Uses a warm, motivating tone

Be concise - this is a quick validation message, not a performance review.`
        },
        {
          role: 'user',
          content: `Intern: ${intern.name}
Role: ${intern.role}
Tasks completed today: ${completedToday}
Completion rate: ${completionRate}%
Total attendance rate: ${intern.stats?.attendanceRate || 0}%

Write a quick validation message for them.`
        }
      ],
      temperature: 0.8,
      max_tokens: 150
    });

    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating validation message:', error);
    return `You completed ${completedToday} tasks today (${completionRate}% completion rate). Good effort!`;
  }
}

/**
 * Verify a screenshot using GPT-4 Vision
 * Checks if work proof is legitimate
 */
async function verifyScreenshot(imageUrl, context) {
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4-vision-preview',
      messages: [
        {
          role: 'system',
          content: `You are an AI manager verifying work completion screenshots.
Analyze the image and determine:
1. Is this legitimate work proof?
2. What work is shown?
3. Does it match the claimed task?
4. Any concerns or red flags?

Return JSON: { "verified": true/false, "workDescription": "...", "concerns": "..." }`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Context: ${context}\n\nIs this legitimate work proof?`
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl
              }
            }
          ]
        }
      ],
      max_tokens: 300,
      response_format: { type: 'json_object' }
    });

    return JSON.parse(completion.choices[0].message.content);
  } catch (error) {
    console.error('Error verifying screenshot:', error);
    return {
      verified: false,
      workDescription: 'Could not analyze image',
      concerns: error.message
    };
  }
}

/**
 * Generate instant check-in acknowledgment
 * Welcoming message when intern checks in
 */
async function generateCheckInResponse(intern, isLate) {
  const now = new Date();
  const hour = now.getHours();

  let timeGreeting = 'Good morning';
  if (hour >= 12 && hour < 17) timeGreeting = 'Good afternoon';
  if (hour >= 17) timeGreeting = 'Good evening';

  const lateNote = isLate ? " (Better late than never! ⏰)" : "";

  return `${timeGreeting}, ${intern.name}!${lateNote} ✅ You're checked in.\n\n💪 Let's crush those tasks today! Type "show tasks" to see what's on your plate.`;
}

module.exports = {
  generateTasks,
  analyzeProgress,
  generateDailySummary,
  generateWeeklyReview,
  learnFromData,
  generateResponse,
  generateLeaderboard,
  generateValidationMessage,
  verifyScreenshot,
  generateCheckInResponse
};
