/**
 * Clinical concept-level tool definitions.
 * All tools are parameterless — visitUuid/patientUuid are baked into the request context.
 */

const CLINICAL_TOOLS = [
  {
    name: 'get_patient_demographics',
    description: 'Get patient name, date of birth, gender, and medical record identifier.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_visit_context',
    description: 'Get visit type, start/end dates, location, and attending providers with their roles.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_vitals',
    description:
      'Get recorded vital signs for this visit: blood pressure, pulse, temperature, SpO2, weight, height, respiratory rate.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_diagnoses',
    description: 'Get diagnoses recorded during this visit, including primary/secondary rank and certainty (confirmed/presumed).',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_presenting_complaints',
    description: 'Get the chief complaint, history of presenting illness, and symptom observations recorded by clinicians.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_examination_findings',
    description:
      'Get physical examination observations recorded during this visit (non-vital, non-symptom clinical findings).',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_medications_ordered',
    description: 'Get drug orders placed during this visit, including drug name, dose, route, frequency, and duration.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_investigations_ordered',
    description: 'Get laboratory and imaging orders placed during this visit, with their current fulfilment status.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_allergies',
    description: "Get the patient's known allergies, including allergen, reaction type, and severity.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_active_conditions',
    description: "Get the patient's active problem list with onset dates and clinical status.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

/** Convert to OpenAI / local-OpenAI-compatible tool format. */
function toOpenAITools() {
  return CLINICAL_TOOLS.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

/** Convert to Gemini function declarations format. */
function toGeminiTools() {
  return [
    {
      functionDeclarations: CLINICAL_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: { type: 'OBJECT', properties: {}, required: [] },
      })),
    },
  ];
}

module.exports = { CLINICAL_TOOLS, toOpenAITools, toGeminiTools };
