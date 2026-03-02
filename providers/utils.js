const DEFAULT_TEMPERATURE = 0.3;

async function throwIfNotOk(response, label) {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${label} error (${response.status}): ${text}`);
  }
}

module.exports = { DEFAULT_TEMPERATURE, throwIfNotOk };
