const { DEFAULT_TEMPERATURE, throwIfNotOk } = require('./utils');
const { runOpenAIToolLoop } = require('../tool-loop/openai');

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const DEFAULT_MODEL = 'gpt-4o-mini';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

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

/**
 * Tool-based OpenAI call for V2 endpoint.
 * @param {string} model
 * @param {string} systemPrompt
 * @param {Array} tools  — OpenAI function tool format
 * @param {import('../clinical-tools/executor').ToolExecutor} executor
 */
async function callOpenAIWithTools(model, systemPrompt, tools, executor) {
  if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY is not set on the server');
  return runOpenAIToolLoop(OPENAI_KEY, OPENAI_BASE_URL, model || DEFAULT_MODEL, systemPrompt, tools, executor);
}

module.exports = callOpenAI;
module.exports.callOpenAIWithTools = callOpenAIWithTools;
