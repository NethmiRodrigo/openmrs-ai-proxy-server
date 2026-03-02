/**
 * Builds the clinical prompt sent to the LLM.
 * Keeping this server-side means the template is never exposed in the browser bundle.
 *
 * @param {string} visitDataJson - JSON.stringify of the serialized visit data object
 * @returns {string}
 */
function buildVisitSummaryPrompt(visitDataJson) {
  return `You are a clinical documentation assistant for a healthcare provider.
Given the structured visit data below, generate a concise clinical
visit summary using exactly this format:

## Visit Summary
**Patient**: ... | **Visit dates**: ... (start to end, may span multiple days) | **Visit Type**: ... | **Provider**: ...

## Vitals
[BP, temp, pulse, weight, O2 sat, etc. — only what was recorded]

## History & Presenting Symptoms
[from clinical form obs — what the patient reported]

## Physical Examination & Findings
[from clinical form obs — what the provider found]

## Diagnoses
[list primary (rank 1) and secondary (rank 2+) diagnoses with certainty (confirmed/presumed)]

## Investigations & Results
[lab orders placed, any results received]

## Medications
[drugs ordered or changed during this visit]

## Plan & Follow-up
[next steps, referrals, follow-up appointments]

---
VISIT DATA:
${visitDataJson}

Rules:
- Only include sections where data was actually collected
- Use plain clinical language
- If a section has no data, omit it entirely
- Do not invent or infer data not present in the input`;
}

module.exports = { buildVisitSummaryPrompt };
