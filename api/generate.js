// Vercel Serverless Function - Generate websites from transcript
// This is called directly when you paste/submit a transcript manually

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { transcript, businessName } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'No transcript provided' });
    }

    // Generate session ID
    const sessionId = `site_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Generate websites using OpenRouter
    const websites = await generateWebsitesFromTranscript(transcript, businessName);

    // Store in Vercel KV (or fallback to returning directly)
    try {
      await kv.set(sessionId, JSON.stringify(websites), { ex: 86400 * 7 }); // 7 days
    } catch (kvError) {
      console.log('KV storage not available, returning directly');
    }

    return res.status(200).json({
      success: true,
      sessionId,
      businessInfo: websites.businessInfo,
      previewUrl: `/preview?id=${sessionId}`,
      websites: {
        modern: websites.modern,
        classic: websites.classic,
        warm: websites.warm
      }
    });

  } catch (error) {
    console.error('Generate error:', error);
    return res.status(500).json({ error: 'Failed to generate websites', details: error.message });
  }
}

async function generateWebsitesFromTranscript(transcript, providedBusinessName) {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const OPENROUTER_MODEL_ID = process.env.OPENROUTER_MODEL_ID || 'anthropic/claude-sonnet-4-20250514';

  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not configured in Vercel environment');
  }

  const systemPrompt = `You are an expert website designer specializing in small business websites.

TASK: Analyze this interview transcript and create 3 unique, complete website designs.

STEP 1 - EXTRACT BUSINESS INFO:
- Business name (use "${providedBusinessName || 'the business'}" if not clearly stated)
- Industry/type
- Services offered
- Target customers
- Unique selling points
- Owner personality/tone
- Location
- Contact info mentioned

STEP 2 - CREATE 3 COMPLETE HTML WEBSITES:

**MODERN** - Bold, contemporary design
- Large hero with gradient background
- Sans-serif fonts (Inter, Poppins)
- Vibrant accent colors
- Card-based layouts
- Smooth animations

**CLASSIC** - Professional, trustworthy
- Traditional layout structure
- Serif headings, clean body text
- Navy/gray/gold color palette
- Formal tone
- Established credibility feel

**WARM** - Friendly, approachable
- Soft, inviting colors (earth tones, pastels)
- Rounded corners, friendly typography
- Personal photos/testimonial focus
- Community-oriented messaging
- Welcoming atmosphere

REQUIREMENTS FOR EACH:
- Complete standalone HTML with embedded CSS
- Mobile responsive
- Sections: Hero, About, Services (3-4 items), Testimonials placeholder, Contact, Footer
- Real content from the transcript (not lorem ipsum)
- Working navigation links
- Professional quality ready to deploy

OUTPUT FORMAT (strict JSON):
{
  "businessInfo": {
    "name": "...",
    "industry": "...",
    "services": ["...", "..."],
    "targetAudience": "...",
    "uniqueValue": "...",
    "location": "...",
    "tone": "..."
  },
  "modern": "<!DOCTYPE html>...(complete HTML)...",
  "classic": "<!DOCTYPE html>...(complete HTML)...",
  "warm": "<!DOCTYPE html>...(complete HTML)..."
}`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://spokensite.ai',
      'X-Title': 'SpokenSite Website Generator'
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL_ID,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Create 3 websites from this interview transcript:\n\n${transcript}` }
      ],
      max_tokens: 32000,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  // Parse JSON from response
  let jsonStr = content;
  if (content.includes('```json')) {
    jsonStr = content.split('```json')[1].split('```')[0];
  } else if (content.includes('```')) {
    jsonStr = content.split('```')[1].split('```')[0];
  }

  return JSON.parse(jsonStr.trim());
}
