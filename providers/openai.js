const { DEFAULT_TEMPERATURE, throwIfNotOk } = require('./utils');

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const DEFAULT_MODEL = 'gpt-4o-mini';

async function callOpenAI(model, prompt) {
  if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY is not set on the server');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: DEFAULT_TEMPERATURE,
    }),
  });

  await throwIfNotOk(response, 'OpenAI API');
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('Invalid OpenAI response');
  const { prompt_tokens: input, completion_tokens: output, total_tokens: total } = data.usage ?? {};
  return { content, usage: { input, output, total } };
}

module.exports = callOpenAI;
