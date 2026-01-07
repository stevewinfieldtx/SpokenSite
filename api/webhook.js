@'
// Vercel Serverless Function - ElevenLabs Webhook Handler
// Receives transcript from ElevenLabs, generates 3 website concepts, saves to Supabase

import crypto from 'crypto';

const ELEVENLABS_WEBHOOK_SECRET = process.env.ELEVENLABS_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function saveToSupabase(sessionId, businessInfo, modern, classic, warm, conversationId) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/generated_sites`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      id: sessionId,
      conversation_id: conversationId,
      business_info: businessInfo,
      modern_html: modern,
      classic_html: classic,
      warm_html: warm
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Supabase error: ${error}`);
  }
  return true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, ElevenLabs-Signature, X-ElevenLabs-Signature');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    console.log('Webhook received:', JSON.stringify(req.body, null, 2));

    const { transcript, conversation_id, data, messages, conversation } = req.body;

    let finalTranscript = transcript;
    if (!finalTranscript && data?.transcript) finalTranscript = data.transcript;
    if (!finalTranscript && conversation?.transcript) finalTranscript = conversation.transcript;
    if (!finalTranscript && messages && Array.isArray(messages)) {
      finalTranscript = messages.map(m => `${m.role || 'unknown'}: ${m.content || m.text || ''}`).join('\n');
    }

    if (!finalTranscript) {
      return res.status(200).json({ received: true, message: 'No transcript found', payload_keys: Object.keys(req.body) });
    }

    console.log('Transcript found, length:', finalTranscript.length);

    // Generate websites
    const websites = await generateWebsites(finalTranscript);
    const sessionId = conversation_id || `session_${Date.now()}`;

    // Save to Supabase
    await saveToSupabase(
      sessionId,
      websites.businessInfo,
      websites.modern,
      websites.classic,
      websites.warm,
      conversation_id
    );

    console.log('Saved to Supabase:', sessionId);

    return res.status(200).json({
      success: true,
      sessionId,
      message: 'Websites generated and saved',
      businessInfo: websites.businessInfo,
      previewUrl: `https://spokensite.com/preview?id=${sessionId}`
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Failed to process', details: error.message });
  }
}

async function generateWebsites(transcript) {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const OPENROUTER_MODEL_ID = process.env.OPENROUTER_MODEL_ID || 'anthropic/claude-sonnet-4-20250514';

  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not configured');

  const systemPrompt = `You are an expert website designer. Based on the interview transcript, extract business info and generate 3 complete HTML websites.

Extract:
- businessName, businessType, keyServices (array), targetAudience, uniqueValueProposition, ownersPersonality, location, contactPreferences

Generate 3 COMPLETE standalone HTML files with embedded CSS:
1. MODERN - Bold, dark theme, neon accents, large typography
2. CLASSIC - Professional navy/gold, traditional layout, trustworthy
3. WARM - Friendly earth tones, rounded corners, inviting

Each must include: Hero, About, Services, Contact, Footer sections with REAL content from transcript.

Return ONLY valid JSON:
{"businessInfo":{...},"modern":"<!DOCTYPE html>...","classic":"<!DOCTYPE html>...","warm":"<!DOCTYPE html>..."}`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://spokensite.com',
      'X-Title': 'SpokenSite'
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL_ID,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Interview transcript:\n\n${transcript}` }
      ],
      max_tokens: 32000,
      temperature: 0.7
    })
  });

  if (!response.ok) throw new Error(`OpenRouter error: ${await response.text()}`);

  const data = await response.json();
  let content = data.choices[0].message.content;
  
  if (content.includes('```json')) content = content.split('```json')[1].split('```')[0];
  else if (content.includes('```')) content = content.split('```')[1].split('```')[0];
  
  return JSON.parse(content.trim());
}
'@ | Set-Content -Path "C:\Users\steve\Documents\SpokenSite\api\webhook.js" -Encoding UTF8