export function buildPrompt(text, accent) {
  const instruction = accent === 'american'
    ? 'Read the following text aloud in a natural American English accent:'
    : 'Read the following text aloud in a natural British English accent:';
  return instruction + '\n\n' + text;
}

export function voiceNameForGender(gender) {
  return gender === 'female' ? 'Kore' : 'Orus';
}

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent';

const ALLOWED_ORIGINS = ['null', 'https://marstan78.github.io'];

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin)),
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, origin);
    }

    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rateLimitResult = await env.RATE_LIMITER.limit({ key: clientIp });
    if (!rateLimitResult.success) {
      return jsonResponse({ error: 'Too many requests, please try again later' }, 429, origin);
    }

    if (origin !== null && !ALLOWED_ORIGINS.includes(origin)) {
      return jsonResponse({ error: 'Origin not allowed' }, 403, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return jsonResponse({ error: 'Invalid JSON body' }, 400, origin);
    }

    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const accent = body.accent === 'american' ? 'american' : 'british';
    const voiceName = voiceNameForGender(body.voice);

    if (!text) {
      return jsonResponse({ error: 'text is required' }, 400, origin);
    }

    const prompt = buildPrompt(text, accent);

    let geminiResponse;
    try {
      geminiResponse = await fetch(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } },
            },
          },
        }),
      });
    } catch (e) {
      return jsonResponse({ error: 'Failed to reach Gemini API' }, 502, origin);
    }

    if (!geminiResponse.ok) {
      return jsonResponse({ error: 'Gemini API error', status: geminiResponse.status }, 502, origin);
    }

    let geminiData;
    try {
      geminiData = await geminiResponse.json();
    } catch (e) {
      return jsonResponse({ error: 'Invalid Gemini API response' }, 502, origin);
    }

    const candidate = geminiData && geminiData.candidates && geminiData.candidates[0];
    const part = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0];
    const inlineData = part && part.inlineData;

    if (!inlineData || !inlineData.data) {
      return jsonResponse({ error: 'Gemini API returned no audio' }, 502, origin);
    }

    return jsonResponse({
      audioBase64: inlineData.data,
      mimeType: inlineData.mimeType || 'audio/L16;codec=pcm;rate=24000',
    }, 200, origin);
  },
};
