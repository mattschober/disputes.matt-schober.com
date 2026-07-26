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
    // mock/tickets.sample.json.
    token: str('HUBSPOT_SERVICE_KEY', '') || str('HUBSPOT_TOKEN', ''),
    baseUrl: str('HUBSPOT_BASE_URL', 'https://api.hubapi.com'),

    // Legal disputes are modelled on HubSpot Tickets (object 0-5).
    objectType: 'tickets',

    // Support Pipeline ("0") in portal 244055979. Override with HUBSPOT_PIPELINE_ID.
    pipelineId: str('HUBSPOT_PIPELINE_ID', '0'),

    // Ticket properties pulled from HubSpot.
    properties: [
      'hs_object_id',
      'subject',
      'content',
      'hs_pipeline',
      'hs_pipeline_stage',
      'hs_ticket_priority',
      'hs_ticket_category',
      'createdate',
      'hs_lastmodifieddate',
    ],
  },

  // --- Publication control (IMPORTANT: this is a PUBLIC website) --------------
  publish: {
    // Only tickets in this pipeline are ever considered for publication.
    restrictToPipeline: true,

    // SAFETY GATE. When true, ONLY tickets whose `markerProperty` equals
    // `markerValue` are published. This lets you keep most CRM tickets private
    // and explicitly opt individual matters into the public portal.
    //
    // Default false keeps the portal working out-of-the-box against the demo
    // portal, but you should set PUBLISH_REQUIRE_MARKER=true (and create the
    // property in HubSpot) before real client matters live in this pipeline.
    requireMarker: bool('PUBLISH_REQUIRE_MARKER', false),
    markerProperty: str('PUBLISH_MARKER_PROPERTY', 'publish_to_portal'),
    markerValue: str('PUBLISH_MARKER_VALUE', 'true'),

    // Whether to publish the free-text `content` field as a public description.
    // Disable (PUBLISH_DESCRIPTIONS=false) if descriptions may contain PII.
    includeDescriptions: bool('PUBLISH_DESCRIPTIONS', true),

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

// Fallback stage metadata for the standard Support Pipeline. The build tries to
// fetch live stage labels from HubSpot first; this is used if that call fails
// or when running against mock data. `state` drives badge colour/semantics.
export const FALLBACK_STAGES = {
  '1': { label: 'Filed', state: 'open' },
  '2': { label: 'Awaiting Response', state: 'waiting' },
  '3': { label: 'Under Review', state: 'active' },
  '4': { label: 'Closed', state: 'closed' },
};

// Human labels for HubSpot's default ticket priority enumeration.
export const PRIORITY_LABELS = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

// Human labels for HubSpot's default ticket category enumeration.
export const CATEGORY_LABELS = {
  PRODUCT_ISSUE: 'Product',
  BILLING_ISSUE: 'Billing',
  FEATURE_REQUEST: 'Feature Request',
  GENERAL_INQUIRY: 'General',
};

// Map a raw pipeline stage label (from the live HubSpot pipeline) to a semantic
// state used for badge styling, since custom pipelines won't match stage ids.
export function stateForStageLabel(label = '') {
  const l = label.toLowerCase();
  if (l.includes('closed') || l.includes('resolved') || l.includes('settled')) return 'closed';
  if (l.includes('waiting') || l.includes('await')) return 'waiting';
  if (l.includes('review') || l.includes('progress') || l.includes('us')) return 'active';
  return 'open';
}
