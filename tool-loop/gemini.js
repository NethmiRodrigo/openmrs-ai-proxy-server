/**
 * Multi-turn Gemini function calling loop.
 */

const { DEFAULT_TEMPERATURE, throwIfNotOk } = require('../providers/utils');

const MAX_ROUNDS = 10;

/**
 * @param {string} apiKey
 * @param {string} model
 * @param {string} systemPrompt
 * @param {Array} tools  — Gemini function declarations format
 * @param {import('../clinical-tools/executor').ToolExecutor} executor
 * @returns {Promise<{ content: string, usage: { input: number, output: number, total: number } }>}
 */
async function runGeminiToolLoop(apiKey, model, systemPrompt, tools, executor) {
  const contents = [{ role: 'user', parts: [{ text: 'Generate a clinical visit summary.' }] }];
  let totalInput = 0;
  let totalOutput = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools,
        tool_config: { function_calling_config: { mode: 'AUTO' } },
        generationConfig: { temperature: DEFAULT_TEMPERATURE },
      }),
    });

    await throwIfNotOk(response, 'Gemini API');
    const data = await response.json();

    const { promptTokenCount: input = 0, candidatesTokenCount: output = 0, totalTokenCount: total = 0 } =
      data.usageMetadata ?? {};
    totalInput += input;
    totalOutput += output;

    const candidate = data.candidates?.[0];
    if (!candidate) throw new Error('Gemini returned no candidates');

    const parts = candidate.content?.parts ?? [];
    const functionCallParts = parts.filter((p) => p.functionCall);
    const textParts = parts.filter((p) => typeof p.text === 'string');

    if (functionCallParts.length === 0) {
      // Final text response
      const content = textParts.map((p) => p.text).join('');
      if (!content) throw new Error('Gemini returned no text content');
      return { content, usage: { input: totalInput, output: totalOutput, total: totalInput + totalOutput } };
    }

    // Append model turn
    contents.push({ role: 'model', parts });

    // Execute tool calls and collect responses
    const responseParts = await Promise.all(
      functionCallParts.map(async (part) => {
        console.log(`[gemini tool-loop] round=${round + 1} calling tool: ${part.functionCall.name}`);
        const result = await executor.execute(part.functionCall.name);
        return {
          functionResponse: {
            name: part.functionCall.name,
            response: { content: JSON.stringify(result) },
          },
        };
      }),
    );

    contents.push({ role: 'user', parts: responseParts });
  }

  throw new Error(`Gemini tool loop exceeded ${MAX_ROUNDS} rounds without producing a final answer`);
}

module.exports = { runGeminiToolLoop };
