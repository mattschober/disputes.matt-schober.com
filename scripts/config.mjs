// Central configuration for the disputes portal build.
//
// Everything that is environment- or portal-specific lives here so the rest of
// the build code stays generic. Values can be overridden with environment
// variables (injected by Doppler in CI) without editing code.

const env = process.env;

/** Read an env var with a default. */
const str = (name, fallback) => (env[name] ?? '').trim() || fallback;
/** Read a boolean env var ("true"/"1"/"yes" => true). */
const bool = (name, fallback) => {
  const v = (env[name] ?? '').trim().toLowerCase();
  if (!v) return fallback;
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
};

export const config = {
  // --- HubSpot ---------------------------------------------------------------
  hubspot: {
    // Private App access token. Provided via Doppler -> env in CI.
    // Primary name is HUBSPOT_SERVICE_KEY (the Doppler secret); HUBSPOT_TOKEN
    // is accepted as a fallback. When absent, the build falls back to
    // mock/disputes.sample.json.
    token: str('HUBSPOT_SERVICE_KEY', '') || str('HUBSPOT_TOKEN', ''),
    baseUrl: str('HUBSPOT_BASE_URL', 'https://api.hubapi.com'),

    // Disputes are modelled on HubSpot Deals (object 0-3), NOT tickets. A deal
    // is "classified as a dispute" by living in the Disputes pipeline.
    objectType: 'deals',

    // The "Disputes" pipeline in portal 244055979. HubSpot's first deal
    // pipeline keeps the literal id "default" even after being renamed.
    //
    // The OTHER pipeline in this portal (1310445295, "Consulting Project
    // Opportunities") holds recruiting leads and must never be published.
    // Publication is restricted to this id both server-side and again locally
    // in hubspot.mjs. Override with HUBSPOT_PIPELINE_ID.
    pipelineId: str('HUBSPOT_PIPELINE_ID', 'default'),

    // Deal properties pulled from HubSpot.
    properties: [
      'hs_object_id',
      'dealname',
      'description',
      'pipeline',
      'dealstage',
      'amount',
      'createdate',
      'closedate',
      'hs_lastmodifieddate',
    ],
  },

  // --- Publication control (IMPORTANT: this is a PUBLIC website) --------------
  publish: {
    // Only deals in the Disputes pipeline are ever considered for publication.
    // This is the primary safety gate: it is what "classified as a dispute"
    // means, and it keeps the consulting pipeline entirely off the site.
    restrictToPipeline: true,

    // OPTIONAL SECOND GATE. When true, ONLY deals whose `markerProperty` equals
    // `markerValue` are published, so individual matters must be opted in by
    // hand even within the Disputes pipeline. Requires a `publish_to_portal`
    // property to exist on Deals in HubSpot — filtering on a property that does
    // not exist makes the Search API return 400.
    requireMarker: bool('PUBLISH_REQUIRE_MARKER', false),
    markerProperty: str('PUBLISH_MARKER_PROPERTY', 'publish_to_portal'),
    markerValue: str('PUBLISH_MARKER_VALUE', 'true'),

    // Whether to publish the free-text `description` as a public summary.
    // Defaults to FALSE: on the Disputes pipeline these are internal working
    // notes ("Need liability documentation"), not public-facing copy.
    includeDescriptions: bool('PUBLISH_DESCRIPTIONS', false),

    // Whether to publish the deal `amount` as a claimed/disputed sum.
    // Defaults to FALSE — money figures invite misreading as judgments owed.
    includeAmounts: bool('PUBLISH_AMOUNTS', false),

    // Public reference numbers are derived, never the raw HubSpot record id.
    referencePrefix: str('REFERENCE_PREFIX', 'MS'),
  },

  // --- Site metadata ---------------------------------------------------------
  site: {
    brand: str('SITE_BRAND', 'Matt Schober'),
    title: str('SITE_TITLE', 'Legal Disputes Portal'),
    domain: str('SITE_DOMAIN', 'disputes.matt-schober.com'),
    tagline: str(
      'SITE_TAGLINE',
      'A public record of legal matters and disputes, maintained for transparency.'
    ),
    contactEmail: str('SITE_CONTACT_EMAIL', 'legal@matt-schober.com'),
  },
};

// Stage metadata for the Disputes pipeline, keyed by HubSpot stage id. The
// build fetches live stage labels first; this is used if that call fails or
// when running against mock data. `state` drives badge colour/semantics.
//
// The ids below are HubSpot's stock deal-stage ids, which persist after the
// stages are renamed — hence the mismatch between id and label.
export const FALLBACK_STAGES = {
  appointmentscheduled: { label: 'Dispute Identified', state: 'open' },
  qualifiedtobuy: { label: 'Communications Sent', state: 'active' },
  presentationscheduled: { label: 'Hold', state: 'waiting' },
  decisionmakerboughtin: { label: 'Court Active', state: 'active' },
  contractsent: { label: 'Post Court', state: 'active' },
  closedwon: { label: 'Closed', state: 'closed' },
  closedlost: { label: 'Closed', state: 'closed' },
};

// Stage ids whose HubSpot label is deliberately NOT shown verbatim. "Closed
// Won"/"Closed Lost" are sales-funnel words; on a public legal record they read
// as a claim about the outcome, so both surface as a neutral "Closed".
export const STAGE_LABEL_OVERRIDES = {
  closedwon: 'Closed',
  closedlost: 'Closed',
};

// Map a raw pipeline stage label (from the live HubSpot pipeline) to a semantic
// state used for badge styling, so renaming or adding stages keeps working.
export function stateForStageLabel(label = '') {
  const l = label.toLowerCase();
  if (/closed|resolved|settled|dismissed|withdrawn|judgment/.test(l)) return 'closed';
  if (/hold|waiting|await|stayed|paused/.test(l)) return 'waiting';
  if (/court|review|progress|active|sent|filed|hearing/.test(l)) return 'active';
  return 'open';
}
