/**
 * Multi-turn Anthropic tool loop.
 */

const { throwIfNotOk } = require('../providers/utils');

const MAX_ROUNDS = 10;

/**
 * @param {string} apiKey
 * @param {string} model
 * @param {string} systemPrompt
 * @param {Array} tools  — Anthropic canonical tool format
 * @param {import('../clinical-tools/executor').ToolExecutor} executor
 * @returns {Promise<{ content: string, usage: { input: number, output: number, total: number } }>}
 */
async function runAnthropicToolLoop(apiKey, model, systemPrompt, tools, executor) {
  const messages = [{ role: 'user', content: 'Generate a clinical visit summary.' }];
  let totalInput = 0;
  let totalOutput = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        tool_choice: { type: 'auto' },
        messages,
      }),
    });

    await throwIfNotOk(response, 'Anthropic API');
    const data = await response.json();

    totalInput += data.usage?.input_tokens ?? 0;
    totalOutput += data.usage?.output_tokens ?? 0;

    const toolUseBlocks = (data.content ?? []).filter((b) => b.type === 'tool_use');
    const textBlocks = (data.content ?? []).filter((b) => b.type === 'text');

    if (toolUseBlocks.length === 0) {
      // No more tool calls — final answer
      const content = textBlocks.map((b) => b.text).join('');
      if (!content) throw new Error('Anthropic returned no text content');
      return { content, usage: { input: totalInput, output: totalOutput, total: totalInput + totalOutput } };
    }

    // Append assistant message with all content blocks
    messages.push({ role: 'assistant', content: data.content });

    // Execute tools and collect results
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        console.log(`[anthropic tool-loop] round=${round + 1} calling tool: ${block.name}`);
        const result = await executor.execute(block.name);
        return {
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        };
      }),
    );

    messages.push({ role: 'user', content: toolResults });
  }

  throw new Error(`Anthropic tool loop exceeded ${MAX_ROUNDS} rounds without producing a final answer`);
}

module.exports = { runAnthropicToolLoop };
