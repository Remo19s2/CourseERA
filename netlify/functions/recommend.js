// netlify/functions/recommend.js
exports.handler = async function(event, context) {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const body = JSON.parse(event.body || '{}');
    const { group, marksObj, computedCutoff, interests } = body;

    const prompt = buildPrompt({ group, marksObj, computedCutoff, interests });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: 'Missing GEMINI_API_KEY in env' }) };

    const resp = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // request body for Gemini
          contents: [
            { role: 'user', parts: [{ text: prompt }] }
          ],
          // low randomness for reliable answers
          temperature: 0.2,
          maxOutputTokens: 800
        })
      }
    );

    const data = await resp.json();
    const ai_text = data?.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(data, null, 2);

    // Try to extract JSON object from response text (AI is asked to output JSON)
    let ai_json = null;
    try {
      const firstBrace = ai_text.indexOf('{');
      const lastBrace = ai_text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const jsonStr = ai_text.slice(firstBrace, lastBrace + 1);
        ai_json = JSON.parse(jsonStr);
      }
    } catch (err) {
      // parsing failed => leave ai_json null and return raw text
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ai_text, ai_json })
    };

  } catch (err) {
    console.error('Function error', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

function buildPrompt({ group, marksObj, computedCutoff, interests }) {
  return `
You are an expert Indian career counselor.
Student data:
- Group: ${group}
- Marks: ${JSON.stringify(marksObj)}
- Computed cutoff: ${computedCutoff?.score} / ${computedCutoff?.max} (${computedCutoff?.formula})
- Interests: ${Array.isArray(interests) ? interests.join(', ') : interests}

Task: Return EXACTLY a JSON object with keys:
{
  "suggestions": [
    { "course": "...", "reason": "...", "entrance": "...", "colleges": ["top example", "accessible example"], "next_steps": "..." }
  ],
  "confidence": 0.0,
  "notes": "..."
}

Give 4-6 suggestion objects. Use 'approx' for cutoffs. Keep each field concise. Do not output extra commentary outside the JSON.
`;
}
