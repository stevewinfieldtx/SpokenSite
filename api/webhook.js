// Vercel Serverless Function - ElevenLabs Webhook Handler
// Generates 3 PREMIUM website concepts with real images and distinctive design

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

    const websites = await generateWebsites(finalTranscript);
    const sessionId = conversation_id || `session_${Date.now()}`;

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

  const systemPrompt = `You are an ELITE website designer who creates stunning, production-ready websites. Your designs are so good they make clients cry with joy.

STEP 1: Extract business info from the transcript:
- businessName, businessType, keyServices (array), targetAudience
- uniqueValueProposition, ownersPersonality, location, contactPreferences
- imageKeywords: 3-5 keywords for finding relevant stock photos

STEP 2: Generate 3 STUNNING websites. Each must be dramatically different and visually impressive.

CRITICAL DESIGN RULES:

1. USE REAL IMAGES from Unsplash. Format: https://images.unsplash.com/photo-[ID]?w=1200&q=80
   - Hero images MUST be full-width, dramatic photos relevant to the business
   - Use at least 3-4 images per site in different sections
   - Pick images that authentically match the business type
   
2. TYPOGRAPHY - Use distinctive Google Fonts (NOT Inter, Roboto, or Arial):
   - MODERN: "Syne" for headings, "Space Grotesk" for body
   - CLASSIC: "Playfair Display" for headings, "Source Sans 3" for body  
   - WARM: "Fraunces" for headings, "Nunito" for body

3. NO EMOJI ICONS - Use Lucide icons via CDN:
   <script src="https://unpkg.com/lucide@latest"></script>
   <i data-lucide="phone"></i> then call lucide.createIcons() at end of body
   
4. EACH STYLE IS DRAMATICALLY DIFFERENT:

   MODERN: Dark background (#0a0a0a), neon accent (#00ff88 or #00d4ff), 
   large bold typography, glassmorphism, animated gradients, full-bleed hero with dark overlay,
   floating cards, asymmetric layouts, hover animations that transform elements.
   
   CLASSIC: Cream background (#faf9f6), navy (#1a2942) + gold (#c9a227),
   elegant serifs, traditional grid, subtle shadows, refined borders,
   professional photography, trust indicators, testimonial cards with quotes.
   
   WARM: Earthy palette - warm white (#fffbf5), terracotta (#c4715b), sage (#6b8f71),
   rounded corners (16-24px), soft shadows, friendly welcoming copy,
   organic shapes, community feel, personal touch.

5. SECTIONS REQUIRED (use REAL content from transcript):
   - Hero: Full-width background image, headline, subhead, CTA button
   - About: Owner story, business personality, credibility
   - Services: Actual services mentioned, with descriptions
   - Why Choose Us: Their unique selling points
   - Testimonials: Create 2-3 realistic reviews based on their value props
   - Contact: Phone (555) XXX-XXXX format, location, CTA
   - Footer: Copyright, basic links

6. CSS REQUIREMENTS:
   - CSS variables for all colors
   - Smooth scroll: html { scroll-behavior: smooth; }
   - Button hover effects with transform and box-shadow
   - Card hover effects that lift and glow
   - Mobile responsive with media queries
   - At least one keyframe animation

UNSPLASH IMAGE IDs BY INDUSTRY (use these exact URLs):
- Plumbing: https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=1200&q=80
- Plumbing 2: https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=800&q=80
- Restaurant: https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&q=80
- Auto repair: https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=1200&q=80
- Landscaping: https://images.unsplash.com/photo-1558904541-efa843a96f01?w=1200&q=80
- Cleaning: https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1200&q=80
- HVAC: https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=1200&q=80
- Electrical: https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=1200&q=80
- Construction: https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&q=80
- Office/business: https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80
- Team/people: https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&q=80

Return ONLY valid JSON with no markdown formatting:
{"businessInfo":{extracted data},"modern":"<!DOCTYPE html>...","classic":"<!DOCTYPE html>...","warm":"<!DOCTYPE html>..."}`;

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
      max_tokens: 64000,
      temperature: 0.8
    })
  });

  if (!response.ok) throw new Error(`OpenRouter error: ${await response.text()}`);

  const data = await response.json();
  let content = data.choices[0].message.content;
  
  content = content.trim();
  if (content.startsWith('```json')) content = content.slice(7);
  if (content.startsWith('```')) content = content.slice(3);
  if (content.endsWith('```')) content = content.slice(0, -3);
  content = content.trim();
  
  return JSON.parse(content);
}
