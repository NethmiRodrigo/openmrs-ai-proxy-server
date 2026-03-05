const { DEFAULT_TEMPERATURE, throwIfNotOk } = require('./utils');
const { runOpenAIToolLoop } = require('../tool-loop/openai');

const LOCAL_API_KEY = process.env.LOCAL_MODEL_API_KEY || 'local';
const LOCAL_BASE_URL = (process.env.LOCAL_MODEL_BASE_URL || 'http://localhost:11434/v1').replace(/\/$/, '');

/**
 * Calls any locally running model server that exposes an OpenAI-compatible
 * /chat/completions endpoint (Ollama, LM Studio, LocalAI, etc.).
 *
 * Configure via LOCAL_MODEL_BASE_URL (default: http://localhost:11434/v1)
 * and optionally LOCAL_MODEL_API_KEY if the server requires one.
 */
async function callLocal(model, prompt) {
  const response = await fetch(`${LOCAL_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${LOCAL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: DEFAULT_TEMPERATURE,
    }),
  });

  await throwIfNotOk(response, 'Local model');
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('Invalid response from local model server');
  const { prompt_tokens: input, completion_tokens: output, total_tokens: total } = data.usage ?? {};
  return { content, usage: { input, output, total } };
}

/**
 * Tool-based local model call for V2 endpoint.
 * Reuses the OpenAI tool loop with the local base URL.
 * @param {string} model
 * @param {string} systemPrompt
 * @param {Array} tools  — OpenAI function tool format
 * @param {import('../clinical-tools/executor').ToolExecutor} executor
 */
async function callLocalWithTools(model, systemPrompt, tools, executor) {
  return runOpenAIToolLoop(LOCAL_API_KEY, LOCAL_BASE_URL, model, systemPrompt, tools, executor);
}

module.exports = callLocal;
module.exports.callLocalWithTools = callLocalWithTools;
