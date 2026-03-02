const { DEFAULT_TEMPERATURE, throwIfNotOk } = require('./utils');

const GEMINI_KEY = process.env.GEMINI_API_KEY;

async function callGemini(model, prompt) {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY is not set on the server');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: DEFAULT_TEMPERATURE },
    }),
  });

  await throwIfNotOk(response, 'Gemini API');
  const data = await response.json();
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof content !== 'string') throw new Error('Invalid Gemini response');
  const { promptTokenCount: input, candidatesTokenCount: output, totalTokenCount: total } = data.usageMetadata ?? {};
  return { content, usage: { input, output, total } };
}

module.exports = callGemini;
