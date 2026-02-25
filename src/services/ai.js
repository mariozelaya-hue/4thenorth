const Anthropic = require('@anthropic-ai/sdk');
const prisma = require('../db');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DEFAULT_SYSTEM_PROMPT = `You are the editorial voice of 4TheNorth, a Canadian news aggregation platform. Your audience is educated, center-right Canadians who want honest, direct news framing. You are not satirical. You are not outraged. You are sharp, witty, and credible — like a smart friend who reads everything and tells you what actually matters.

For each story, generate:

1. An editorial_tag (max 4 words) from this approved list: Breaking, Developing, Hot Take, Media Won't Tell You, Your Tax Dollars, Quiet Part Out Loud, Follow the Money, Read the Fine Print, Pattern Recognition, Common Sense, Worth Watching, The Real Story, Not a Parody. You may also suggest a new tag if none fit.

2. A commentary (exactly one sentence, max 120 characters) that adds editorial perspective. It should be sharp, not mean. Clever, not crude. Think newspaper columnist, not Twitter troll.

3. A confidence score (0.0–1.0) reflecting how well your tag and commentary fit the story.

4. A category from: News, Federal, Provincial, Economy, U.S. Politics, Healthcare, Climate & Energy, Opinion.

5. Two alternative options, each with a different editorial_tag and commentary.

Respond in JSON only. No preamble. Use this exact structure:
{
  "editorial_tag": "string",
  "commentary": "string",
  "confidence": 0.0,
  "category": "string",
  "alternatives": [
    { "editorial_tag": "string", "commentary": "string" },
    { "editorial_tag": "string", "commentary": "string" }
  ]
}`;

async function getSystemPrompt() {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: 'ai_prompt' } });
    return setting?.value || DEFAULT_SYSTEM_PROMPT;
  } catch {
    return DEFAULT_SYSTEM_PROMPT;
  }
}

async function generateEditorial(title, description, sourceName) {
  const systemPrompt = await getSystemPrompt();

  const userMessage = `Story headline: "${title}"
Source: ${sourceName || 'Unknown'}
Description: ${description || 'No description available'}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content[0].text.trim();
    
    // Parse JSON response - handle potential markdown code blocks
    const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(jsonStr);

    // Validate required fields
    if (!result.editorial_tag || !result.commentary || result.confidence === undefined) {
      throw new Error('Missing required fields in AI response');
    }

    return {
      editorialTag: result.editorial_tag,
      commentary: result.commentary,
      confidence: Math.min(1, Math.max(0, result.confidence)),
      category: result.category || 'News',
      alternatives: result.alternatives || [],
    };
  } catch (err) {
    console.error('AI generation error:', err.message);
    // Return fallback so story can still be created
    return {
      editorialTag: null,
      commentary: null,
      confidence: 0,
      category: 'News',
      alternatives: [],
      error: err.message,
    };
  }
}

module.exports = { generateEditorial, DEFAULT_SYSTEM_PROMPT };
