/**
 * ToolExecutor — dispatches tool name → VisitDataFetcher method.
 */

const { VisitDataFetcher } = require('./visit-data');

class ToolExecutor {
  /**
   * @param {{ visitUuid: string, patientUuid: string }} opts
   */
  constructor(opts) {
    this.fetcher = new VisitDataFetcher(opts);
  }

  /**
   * Execute a tool by name.
   * @param {string} toolName
   * @returns {Promise<object>}
   */
  async execute(toolName) {
    console.log(`[tool] ${toolName}`);
    try {
      switch (toolName) {
        case 'get_patient_demographics':
          return await this.fetcher.getPatientDemographics();
        case 'get_visit_context':
          return await this.fetcher.getVisitContext();
        case 'get_vitals':
          return await this.fetcher.getVitals();
        case 'get_diagnoses':
          return await this.fetcher.getDiagnoses();
        case 'get_presenting_complaints':
          return await this.fetcher.getPresentingComplaints();
        case 'get_examination_findings':
          return await this.fetcher.getExaminationFindings();
        case 'get_medications_ordered':
          return await this.fetcher.getMedicationsOrdered();
        case 'get_investigations_ordered':
          return await this.fetcher.getInvestigationsOrdered();
        case 'get_allergies':
          return await this.fetcher.getAllergies();
        case 'get_active_conditions':
          return await this.fetcher.getActiveConditions();
        default:
          return { error: `Unknown tool: ${toolName}` };
      }
    } catch (err) {
      console.error(`[tool] ${toolName} failed: ${err.message}`);
      return { error: err.message };
    }
  }
}

module.exports = { ToolExecutor };
