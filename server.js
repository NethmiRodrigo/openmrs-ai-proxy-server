require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { buildVisitSummaryPrompt } = require('./prompt-template');
const callOpenAI = require('./providers/openai');
const callAnthropic = require('./providers/anthropic');
const callGemini = require('./providers/gemini');
const callLocal = require('./providers/local');

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:8080')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const allowedOriginSet = new Set(allowedOrigins);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOriginSet.has(origin)) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
  }),
);

app.use(express.json({ limit: '1mb' }));

const PROVIDERS = { openai: callOpenAI, anthropic: callAnthropic, gemini: callGemini, local: callLocal };

/**
 * POST /api/generate-visit-summary
 *
 * Body: { provider: 'openai' | 'anthropic' | 'gemini' | 'local', model: string, visitData: object }
 * Response: { summary: string }
 */
app.post('/api/generate-visit-summary', async (req, res) => {
  const { provider, model, visitData } = req.body ?? {};

  if (!provider || !model || !visitData) {
    return res.status(400).json({ error: 'provider, model, and visitData are required' });
  }

  const callProvider = PROVIDERS[provider];
  if (!callProvider) {
    return res.status(400).json({ error: `Unknown provider: ${provider}` });
  }

  console.log(`[POST /api/generate-visit-summary] provider=${provider} model=${model}`);
  const start = Date.now();

  try {
    const prompt = buildVisitSummaryPrompt(JSON.stringify(visitData, null, 2));
    const { content: summary, usage } = await callProvider(model, prompt);
    const tokens = usage?.total != null
      ? `${usage.input} in / ${usage.output} out / ${usage.total} total tokens`
      : 'token usage unavailable';
    console.log(`[POST /api/generate-visit-summary] ${provider}/${model} responded in ${Date.now() - start}ms — ${tokens}`);
    return res.json({ summary });
  } catch (err) {
    console.error(`[POST /api/generate-visit-summary] ${provider}/${model} failed in ${Date.now() - start}ms: ${err.message}`);
    return res.status(502).json({ error: err.message });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`openmrs-ai-proxy-server listening on http://localhost:${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);

  console.log('[openai]    ', process.env.OPENAI_API_KEY    ? 'ready' : 'no API key set');
  console.log('[anthropic] ', process.env.ANTHROPIC_API_KEY ? 'ready' : 'no API key set');
  console.log('[gemini]    ', process.env.GEMINI_API_KEY    ? 'ready' : 'no API key set');
  console.log('[local]      target:', process.env.LOCAL_MODEL_BASE_URL || 'http://localhost:11434/v1');
});
