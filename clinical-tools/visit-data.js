/**
 * VisitDataFetcher — server-side port of the frontend ai-visit-summary.resource.ts logic.
 * Fetches OpenMRS data and extracts clinical concepts on demand.
 */

const VISIT_CUSTOM_REPRESENTATION =
  'custom:(uuid,location,encounters:(uuid,diagnoses:(uuid,display,rank,diagnosis,voided),form:(uuid,display,name,description,encounterType,version,resources:(uuid,display,name,valueReference)),encounterDatetime,orders:full,obs:(uuid,concept:(uuid,display,conceptClass:(uuid,display)),display,groupMembers:(uuid,concept:(uuid,display),value:(uuid,display),display),value,obsDatetime),encounterType:(uuid,display,viewPrivilege,editPrivilege),encounterProviders:(uuid,display,encounterRole:(uuid,display),provider:(uuid,person:(uuid,display)))),visitType:(uuid,name,display),startDatetime,stopDatetime,patient,attributes:(attributeType:ref,display,uuid,value)';

const VITAL_CONCEPT_DISPLAYS = [
  'systolic',
  'diastolic',
  'blood pressure',
  'pulse',
  'heart rate',
  'temperature',
  'temp',
  'weight',
  'height',
  'oxygen',
  'respiratory',
  'spo2',
];

const SYMPTOM_KEYWORDS = ['complaint', 'history', 'symptom', 'presenting', 'chief', 'hopi', 'hpi'];

const SEPARATOR = ' › ';
const MAX_RECURSE_DEPTH = 3;

function isVital(conceptDisplay) {
  const lower = (conceptDisplay ?? '').toLowerCase();
  return VITAL_CONCEPT_DISPLAYS.some((v) => lower.includes(v));
}

function isSymptom(conceptDisplay) {
  const lower = (conceptDisplay ?? '').toLowerCase();
  return SYMPTOM_KEYWORDS.some((k) => lower.includes(k));
}

function flattenObsGroupMembers(members, parentConcept, depth, out) {
  if (depth > MAX_RECURSE_DEPTH) return;
  const conceptChain = parentConcept ? `${parentConcept}${SEPARATOR}` : '';
  for (const member of members ?? []) {
    const conceptDisplay = member.concept?.display ?? '';
    const fullConcept = conceptChain + conceptDisplay;
    const value = member.value?.display ?? member.display ?? (typeof member.value === 'string' ? member.value : '') ?? '';
    if (Array.isArray(member.groupMembers) && member.groupMembers.length > 0) {
      flattenObsGroupMembers(member.groupMembers, fullConcept, depth + 1, out);
    } else {
      out.push({ concept: fullConcept, value: String(value) });
    }
  }
}

function flattenObs(obs) {
  const result = [];
  for (const o of obs ?? []) {
    const conceptDisplay = o.concept?.display ?? '';
    const value = o.value?.display ?? o.display ?? (typeof o.value === 'string' ? o.value : '') ?? '';
    if (Array.isArray(o.groupMembers) && o.groupMembers.length > 0) {
      flattenObsGroupMembers(o.groupMembers, conceptDisplay, 1, result);
    } else {
      result.push({ concept: conceptDisplay, value: String(value) });
    }
  }
  return result;
}

const OPENMRS_BASIC_AUTH = Buffer.from(
  `${process.env.OPENMRS_USERNAME || 'admin'}:${process.env.OPENMRS_PASSWORD || 'Admin123'}`,
).toString('base64');

const OPENMRS_BASE_URL = (process.env.OPENMRS_BASE_URL || 'http://localhost:8080/openmrs').replace(/\/$/, '');

class VisitDataFetcher {
  /**
   * @param {{ visitUuid: string, patientUuid: string }} opts
   */
  constructor({ visitUuid, patientUuid }) {
    this.visitUuid = visitUuid;
    this.patientUuid = patientUuid;
    this.baseUrl = OPENMRS_BASE_URL;
    /** @type {object|null} */
    this._visitCache = null;
    /** @type {object|null} */
    this._allergiesCache = null;
    /** @type {object|null} */
    this._conditionsCache = null;
    /** @type {object|null} */
    this._demographicsCache = null;
  }

  _headers() {
    return {
      'Content-Type': 'application/json',
      Authorization: `Basic ${OPENMRS_BASIC_AUTH}`,
    };
  }

  async fetchVisit() {
    if (this._visitCache) return this._visitCache;
    const url = `${this.baseUrl}/ws/rest/v1/visit/${this.visitUuid}?v=${VISIT_CUSTOM_REPRESENTATION}`;
    const res = await fetch(url, { headers: this._headers() });
    if (!res.ok) throw new Error(`OpenMRS visit fetch failed (${res.status})`);
    const text = await res.text();
    if (!text.trim()) throw new Error('OpenMRS visit fetch returned empty body');
    this._visitCache = JSON.parse(text);
    return this._visitCache;
  }

  async fetchAllergies() {
    if (this._allergiesCache) return this._allergiesCache;
    const url = `${this.baseUrl}/ws/rest/v1/patient/${this.patientUuid}/allergy?v=full`;
    const res = await fetch(url, { headers: this._headers() });
    if (!res.ok) return { results: [] };
    const text = await res.text();
    this._allergiesCache = text.trim() ? JSON.parse(text) : { results: [] };
    return this._allergiesCache;
  }

  async fetchConditions() {
    if (this._conditionsCache) return this._conditionsCache;
    const url = `${this.baseUrl}/ws/fhir2/R4/Condition?patient=${this.patientUuid}&_count=100`;
    const res = await fetch(url, { headers: this._headers() });
    if (!res.ok) return { entry: [], total: 0 };
    const text = await res.text();
    this._conditionsCache = text.trim() ? JSON.parse(text) : { entry: [], total: 0 };
    return this._conditionsCache;
  }

  async fetchDemographics() {
    if (this._demographicsCache) return this._demographicsCache;
    const url = `${this.baseUrl}/ws/fhir2/R4/Patient/${this.patientUuid}`;
    const res = await fetch(url, { headers: this._headers() });
    if (!res.ok) return null;
    const text = await res.text();
    this._demographicsCache = text.trim() ? JSON.parse(text) : null;
    return this._demographicsCache;
  }

  // ─── Extraction helpers ────────────────────────────────────────────────

  async getPatientDemographics() {
    const patient = await this.fetchDemographics();
    if (!patient) return { error: 'Demographics unavailable' };
    const name =
      patient.name?.[0]?.text ??
      [patient.name?.[0]?.given?.join(' '), patient.name?.[0]?.family].filter(Boolean).join(' ').trim() ??
      '';
    const identifier =
      patient.identifier?.find((i) => i.use === 'official')?.value ??
      patient.identifier?.[0]?.value ??
      '';
    return {
      name,
      birthDate: patient.birthDate ?? '',
      gender: patient.gender ?? '',
      identifier,
    };
  }

  async getVisitContext() {
    const visit = await this.fetchVisit();
    const providers = [];
    for (const enc of visit?.encounters ?? []) {
      for (const ep of enc.encounterProviders ?? []) {
        const name = ep.provider?.person?.display ?? ep.display ?? '';
        const role = ep.encounterRole?.display ?? '';
        if (name && !providers.some((p) => p.name === name)) {
          providers.push({ name, role });
        }
      }
    }
    return {
      visitType: visit?.visitType?.display ?? '',
      location: visit?.location?.display ?? '',
      startDatetime: visit?.startDatetime ?? '',
      endDatetime: visit?.stopDatetime ?? visit?.startDatetime ?? '',
      providers,
    };
  }

  async getVitals() {
    const visit = await this.fetchVisit();
    const vitals = [];
    for (const enc of visit?.encounters ?? []) {
      const encDate = enc.encounterDatetime ?? '';
      for (const o of flattenObs(enc.obs ?? [])) {
        if (isVital(o.concept)) {
          vitals.push({ concept: o.concept, value: o.value, datetime: encDate });
        }
      }
    }
    return { vitals };
  }

  async getDiagnoses() {
    const visit = await this.fetchVisit();
    const diagnoses = [];
    for (const enc of visit?.encounters ?? []) {
      for (const d of enc.diagnoses ?? []) {
        if (d.voided) continue;
        const display = d.diagnosis?.coded?.display ?? d.display ?? '';
        const certainty =
          typeof d.certainty === 'string'
            ? d.certainty.trim()
            : d.certainty?.display?.trim() ?? '';
        diagnoses.push({ display, rank: d.rank ?? 999, certainty });
      }
    }
    diagnoses.sort((a, b) => a.rank - b.rank);
    return { diagnoses };
  }

  async getPresentingComplaints() {
    const visit = await this.fetchVisit();
    const observations = [];
    for (const enc of visit?.encounters ?? []) {
      for (const o of flattenObs(enc.obs ?? [])) {
        if (isSymptom(o.concept) && !isVital(o.concept)) {
          observations.push(o);
        }
      }
    }
    return { observations };
  }

  async getExaminationFindings() {
    const visit = await this.fetchVisit();
    const observations = [];
    for (const enc of visit?.encounters ?? []) {
      for (const o of flattenObs(enc.obs ?? [])) {
        if (!isVital(o.concept) && !isSymptom(o.concept)) {
          observations.push(o);
        }
      }
    }
    return { observations };
  }

  async getMedicationsOrdered() {
    const visit = await this.fetchVisit();
    const medications = [];
    for (const enc of visit?.encounters ?? []) {
      for (const order of enc.orders ?? []) {
        const orderTypeDisplay = order.orderType?.display ?? '';
        const isDrug = orderTypeDisplay.toLowerCase().includes('drug') || !!order.drug;
        if (!isDrug) continue;
        const drugDisplay = order.drug?.display ?? order.concept?.display ?? order.display ?? '';
        medications.push({
          drug: drugDisplay,
          dose: String(order.dose ?? ''),
          route: order.route?.display ?? '',
          frequency: order.frequency?.display ?? '',
          duration: `${order.duration ?? ''} ${order.durationUnits?.display ?? ''}`.trim(),
          orderer: order.orderer?.display ?? '',
          dateOrdered: order.dateActivated ? new Date(order.dateActivated).toISOString().slice(0, 10) : '',
        });
      }
    }
    return { medications };
  }

  async getInvestigationsOrdered() {
    const visit = await this.fetchVisit();
    const investigations = [];
    for (const enc of visit?.encounters ?? []) {
      for (const order of enc.orders ?? []) {
        const orderTypeDisplay = order.orderType?.display ?? '';
        const isDrug = orderTypeDisplay.toLowerCase().includes('drug') || !!order.drug;
        if (isDrug) continue;
        const testDisplay = order.concept?.display ?? order.display ?? 'Test';
        investigations.push({
          test: testDisplay,
          dateOrdered: order.dateActivated ? new Date(order.dateActivated).toISOString().slice(0, 10) : '',
          status: order.fulfillerStatus ?? 'Ordered',
        });
      }
    }
    return { investigations };
  }

  async getAllergies() {
    const data = await this.fetchAllergies();
    const allergies = (data?.results ?? []).map((a) => ({
      allergen: a.allergen?.codedAllergen?.display ?? 'Unknown',
      reaction: a.reactions?.[0]?.reaction?.display ?? '',
      severity: a.severity?.display ?? '',
    }));
    return { allergies };
  }

  async getActiveConditions() {
    const data = await this.fetchConditions();
    const conditions = (data?.entry ?? [])
      .map((e) => e.resource)
      .filter(Boolean)
      .map((r) => ({
        condition: r.code?.coding?.[0]?.display ?? 'Unknown',
        onsetDate: r.onsetDateTime?.slice(0, 7) ?? '',
        status: r.clinicalStatus?.coding?.[0]?.code ?? 'active',
      }));
    return { conditions };
  }
}

module.exports = { VisitDataFetcher };
