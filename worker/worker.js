export function buildPrompt(text, accent) {
  const instruction = accent === 'american'
    ? 'Read the following text aloud in a natural American English accent:'
    : 'Read the following text aloud in a natural British English accent:';
  return instruction + '\n\n' + text;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders()),
  });
}

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const accent = body.accent === 'american' ? 'american' : 'british';

    if (!text) {
      return jsonResponse({ error: 'text is required' }, 400);
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
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
            },
          },
        }),
      });
    } catch (e) {
      return jsonResponse({ error: 'Failed to reach Gemini API' }, 502);
    }

    if (!geminiResponse.ok) {
      return jsonResponse({ error: 'Gemini API error', status: geminiResponse.status }, 502);
    }

    const geminiData = await geminiResponse.json();
    const candidate = geminiData && geminiData.candidates && geminiData.candidates[0];
    const part = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0];
    const inlineData = part && part.inlineData;

    if (!inlineData || !inlineData.data) {
      return jsonResponse({ error: 'Gemini API returned no audio' }, 502);
    }

    return jsonResponse({
      audioBase64: inlineData.data,
      mimeType: inlineData.mimeType || 'audio/L16;codec=pcm;rate=24000',
    }, 200);
  },
};
