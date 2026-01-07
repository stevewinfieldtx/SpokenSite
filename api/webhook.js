// Vercel Serverless Function - ElevenLabs Webhook Handler
// Receives transcript from ElevenLabs, generates 3 website concepts

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { transcript, conversation_id, agent_id } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'No transcript provided' });
    }

    console.log('Received transcript:', transcript.substring(0, 200) + '...');

    // Generate 3 website concepts using OpenRouter
    const websites = await generateWebsites(transcript);

    // Store the generated websites (in production, use a database)
    const sessionId = conversation_id || `session_${Date.now()}`;
    
    // For now, return the URLs where websites will be viewable
    const result = {
      success: true,
      sessionId,
      websites: [
        { name: 'Modern & Bold', url: `/generated/${sessionId}/modern.html` },
        { name: 'Classic & Professional', url: `/generated/${sessionId}/classic.html` },
        { name: 'Warm & Inviting', url: `/generated/${sessionId}/warm.html` }
      ],
      previewUrl: `/preview/${sessionId}`
    };

    return res.status(200).json(result);

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Failed to process transcript', details: error.message });
  }
}

async function generateWebsites(transcript) {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const OPENROUTER_MODEL_ID = process.env.OPENROUTER_MODEL_ID || 'anthropic/claude-sonnet-4-20250514';

  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  const systemPrompt = `You are a website designer. Based on the interview transcript, extract:
1. Business name
2. Business type/industry
3. Key services/offerings
4. Target audience
5. Unique value proposition
6. Owner's personality/tone
7. Location (if mentioned)
8. Contact preferences

Then generate 3 complete HTML websites with different styles:
1. MODERN - Bold colors, large typography, minimal design
2. CLASSIC - Professional, traditional layout, trustworthy feel
3. WARM - Inviting colors, friendly tone, community-focused

Each website must be a complete, standalone HTML file with embedded CSS.
Include placeholder sections for: Hero, About, Services, Testimonials, Contact, Footer.
Use the actual business information from the transcript.

Return as JSON:
{
  "businessInfo": { extracted info },
  "modern": "complete HTML...",
  "classic": "complete HTML...",
  "warm": "complete HTML..."
}`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://spokensite.ai',
      'X-Title': 'SpokenSite'
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL_ID,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Interview transcript:\n\n${transcript}` }
      ],
      max_tokens: 16000,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  // Parse the JSON response
  try {
    // Handle potential markdown code blocks
    let jsonStr = content;
    if (content.includes('```json')) {
      jsonStr = content.split('```json')[1].split('```')[0];
    } else if (content.includes('```')) {
      jsonStr = content.split('```')[1].split('```')[0];
    }
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('Failed to parse AI response:', e);
    throw new Error('Failed to parse generated websites');
  }
}
