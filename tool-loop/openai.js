/**
 * Multi-turn OpenAI (and OpenAI-compatible) tool loop.
 */

const { DEFAULT_TEMPERATURE, throwIfNotOk } = require('../providers/utils');

const MAX_ROUNDS = 10;

/**
 * @param {string} apiKey
 * @param {string} baseUrl  — e.g. 'https://api.openai.com/v1' or local URL
 * @param {string} model
 * @param {string} systemPrompt
 * @param {Array} tools  — OpenAI function tool format
 * @param {import('../clinical-tools/executor').ToolExecutor} executor
 * @returns {Promise<{ content: string, usage: { input: number, output: number, total: number } }>}
 */
async function runOpenAIToolLoop(apiKey, baseUrl, model, systemPrompt, tools, executor) {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Generate a clinical visit summary.' },
  ];
  let totalInput = 0;
  let totalOutput = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: DEFAULT_TEMPERATURE,
      }),
    });

    await throwIfNotOk(response, 'OpenAI API');
    const data = await response.json();

    const { prompt_tokens: input = 0, completion_tokens: output = 0, total_tokens: total = 0 } = data.usage ?? {};
    totalInput += input;
    totalOutput += output;

    const choice = data.choices?.[0];
    if (!choice) throw new Error('OpenAI returned no choices');

    const { finish_reason, message } = choice;

    if (finish_reason === 'tool_calls' && message.tool_calls?.length) {
      messages.push(message);

      const toolResults = await Promise.all(
        message.tool_calls.map(async (tc) => {
          console.log(`[openai tool-loop] round=${round + 1} calling tool: ${tc.function.name}`);
          const result = await executor.execute(tc.function.name);
          return {
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          };
        }),
      );

      messages.push(...toolResults);
    } else {
      const content = message?.content;
      if (typeof content !== 'string') throw new Error('OpenAI returned no text content');
      return {
        content,
        usage: { input: totalInput, output: totalOutput, total: totalInput + totalOutput },
      };
    }
  }

  throw new Error(`OpenAI tool loop exceeded ${MAX_ROUNDS} rounds without producing a final answer`);
}

module.exports = { runOpenAIToolLoop };
