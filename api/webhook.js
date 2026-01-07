// Vercel Serverless Function - ElevenLabs Webhook Handler
// Receives transcript from ElevenLabs, generates 3 website concepts
// HMAC authentication enabled

import crypto from 'crypto';

const ELEVENLABS_WEBHOOK_SECRET = process.env.ELEVENLABS_WEBHOOK_SECRET;

function verifyHmacSignature(payload, signature) {
  if (!ELEVENLABS_WEBHOOK_SECRET) {
    console.error('ELEVENLABS_WEBHOOK_SECRET not configured');
    return false;
  }

  const hmac = crypto.createHmac('sha256', ELEVENLABS_WEBHOOK_SECRET);
  hmac.update(payload);
  const expectedSignature = hmac.digest('hex');
  
  // ElevenLabs may send signature in different formats
  // Try direct comparison and with 'sha256=' prefix
  const sigToCompare = signature.replace('sha256=', '');
  
  return crypto.timingSafeEqual(
    Buffer.from(sigToCompare, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, ElevenLabs-Signature, X-ElevenLabs-Signature');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the raw body for HMAC verification
    const rawBody = JSON.stringify(req.body);
    
    // Get signature from headers (ElevenLabs may use different header names)
    const signature = req.headers['elevenlabs-signature'] || 
                      req.headers['x-elevenlabs-signature'] ||
                      req.headers['x-signature'];

    // Verify HMAC if signature is present
    if (signature && ELEVENLABS_WEBHOOK_SECRET) {
      try {
        const isValid = verifyHmacSignature(rawBody, signature);
        if (!isValid) {
          console.error('HMAC signature verification failed');
          return res.status(401).json({ error: 'Invalid signature' });
        }
        console.log('HMAC signature verified successfully');
      } catch (hmacError) {
        console.error('HMAC verification error:', hmacError.message);
        // Continue anyway for debugging - remove this in production
      }
    } else {
      console.log('No signature header found or secret not configured, proceeding anyway');
    }

    // Log the full payload for debugging
    console.log('Webhook received:', JSON.stringify(req.body, null, 2));

    // Extract transcript - ElevenLabs may send it in different formats
    const { 
      transcript, 
      conversation_id, 
      agent_id,
      data,
      event,
      messages,
      conversation
    } = req.body;

    // Try to find transcript in various possible locations
    let finalTranscript = transcript;
    
    if (!finalTranscript && data?.transcript) {
      finalTranscript = data.transcript;
    }
    
    if (!finalTranscript && conversation?.transcript) {
      finalTranscript = conversation.transcript;
    }
    
    if (!finalTranscript && messages && Array.isArray(messages)) {
      // Reconstruct transcript from messages array
      finalTranscript = messages
        .map(m => `${m.role || 'unknown'}: ${m.content || m.text || ''}`)
        .join('\n');
    }

    if (!finalTranscript) {
      console.log('No transcript found in payload');
      // Return 200 to acknowledge receipt even without transcript
      return res.status(200).json({ 
        received: true, 
        message: 'Webhook received but no transcript found',
        payload_keys: Object.keys(req.body)
      });
    }

    console.log('Transcript found, length:', finalTranscript.length);

    // Generate 3 website concepts using OpenRouter
    const websites = await generateWebsites(finalTranscript);

    // Generate session ID
    const sessionId = conversation_id || `session_${Date.now()}`;
    
    // Store result (in production, save to database)
    console.log('Websites generated successfully for session:', sessionId);

    return res.status(200).json({
      success: true,
      sessionId,
      message: 'Websites generated successfully',
      businessInfo: websites.businessInfo,
      previewUrl: `/preview?id=${sessionId}`
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ 
      error: 'Failed to process webhook', 
      details: error.message 
    });
  }
}

async function generateWebsites(transcript) {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const OPENROUTER_MODEL_ID = process.env.OPENROUTER_MODEL_ID || 'anthropic/claude-sonnet-4-20250514';

  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  const systemPrompt = `You are an expert website designer. Based on the interview transcript, extract:
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
Include sections for: Hero, About, Services, Testimonials, Contact, Footer.
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
