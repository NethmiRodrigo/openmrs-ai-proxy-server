const { throwIfNotOk } = require('./utils');

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

async function callAnthropic(model, prompt) {
  if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY is not set on the server');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  await throwIfNotOk(response, 'Anthropic API');
  const data = await response.json();
  const content = data?.content?.[0]?.text;
  if (typeof content !== 'string') throw new Error('Invalid Anthropic response');
  const input = data.usage?.input_tokens;
  const output = data.usage?.output_tokens;
  return { content, usage: { input, output, total: input + output } };
}

module.exports = callAnthropic;
