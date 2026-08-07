// HubSpot data access for the disputes build.
//
// No SDK: uses native fetch (Node >= 18). All network access is server-side at
// build time — the access token never reaches the browser.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK_PATH = join(__dirname, '..', 'mock', 'disputes.sample.json');

/** Scopes the Private App token needs, by what breaks without them. */
const REQUIRED_SCOPES = {
  required: 'crm.objects.deals.read',
  optional: 'crm.pipelines.read',
};

/**
 * Turn HubSpot's generic auth failures into an error that names the fix.
 * A bare "403 Forbidden" sent this build into a silent 12-day failure loop.
 */
function explain(status, body) {
  let category = '';
  try {
    category = JSON.parse(body).category || '';
  } catch {
    /* body is not JSON — fall through to the status-based hints */
  }

  if (category === 'MISSING_SCOPES' || status === 403) {
    return [
      `The HubSpot token is missing the scope this call needs (${REQUIRED_SCOPES.required}).`,
      'Fix in HubSpot → Settings → Integrations → Private Apps → your app → Scopes,',
      `then re-copy the regenerated token into Doppler as HUBSPOT_SERVICE_KEY.`,
      'Note that a HubSpot *developer* API key cannot read CRM records at all —',
      'this must be a Private App access token issued by portal 244055979.',
    ].join('\n  ');
  }
  if (status === 401) {
    return 'The HubSpot token is invalid, revoked, or from a different portal. Re-issue it and update HUBSPOT_SERVICE_KEY in Doppler.';
  }
  if (status === 400) {
    return 'HubSpot rejected the request. If PUBLISH_REQUIRE_MARKER is on, check that the marker property actually exists on Deals.';
  }
  if (status === 429) {
    return 'HubSpot rate limit hit. This is usually transient — re-run the workflow.';
  }
  return '';
}

async function hsFetch(path, options = {}) {
  const url = `${config.hubspot.baseUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.hubspot.token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const hint = explain(res.status, body);
    throw new Error(
      `HubSpot ${options.method || 'GET'} ${path} failed: ${res.status} ${res.statusText}` +
        (hint ? `\n\n  ${hint}\n` : '') +
        `\n  HubSpot said: ${body}`
    );
  }
  return res.json();
}

/**
 * Fetch stage id -> { label, order } for the configured deal pipeline.
 * Returns null on any failure so callers can fall back to FALLBACK_STAGES.
 */
export async function fetchPipelineStages() {
  try {
    const data = await hsFetch(
      `/crm/v3/pipelines/${config.hubspot.objectType}/${encodeURIComponent(config.hubspot.pipelineId)}`
    );
    const stages = {};
    for (const s of data.stages || []) {
      stages[s.id] = { label: s.label, order: s.displayOrder ?? 0 };
    }
    return Object.keys(stages).length ? stages : null;
  } catch (err) {
    console.warn(
      `⚠️  Could not fetch live stage labels (optional scope ${REQUIRED_SCOPES.optional}); ` +
        `using built-in labels instead.\n   ${err.message.split('\n')[0]}`
    );
    return null;
  }
}

/**
 * Fetch every deal in the disputes pipeline, following pagination.
 * Publication filters are applied server-side where HubSpot supports it.
 */
export async function fetchDisputeDeals() {
  const { hubspot, publish } = config;

  const filters = [];
  if (publish.restrictToPipeline) {
    filters.push({
      propertyName: 'pipeline',
      operator: 'EQ',
      value: hubspot.pipelineId,
    });
  }
  if (publish.requireMarker) {
    filters.push({
      propertyName: publish.markerProperty,
      operator: 'EQ',
      value: publish.markerValue,
    });
  }

  const properties = [...hubspot.properties];
  if (publish.requireMarker && !properties.includes(publish.markerProperty)) {
    properties.push(publish.markerProperty);
  }

  const results = [];
  let after;
  do {
    const body = {
      filterGroups: filters.length ? [{ filters }] : [],
      properties,
      limit: 100,
      sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
      ...(after ? { after } : {}),
    };
    const page = await hsFetch(
      `/crm/v3/objects/${hubspot.objectType}/search`,
      { method: 'POST', body: JSON.stringify(body) }
    );
    results.push(...(page.results || []));
    after = page.paging?.next?.after;
  } while (after);

  return enforcePipeline(results);
}

/**
 * Belt-and-braces: drop anything not in the disputes pipeline, even though the
 * search was already filtered. A dropped or malformed server-side filter would
 * otherwise publish the consulting pipeline to a public website, so the last
 * word on what may be published stays here, in code, on the build machine.
 */
export function enforcePipeline(deals) {
  const { pipelineId } = config.hubspot;
  if (!config.publish.restrictToPipeline) return deals;

  const kept = deals.filter((d) => d.properties?.pipeline === pipelineId);
  const dropped = deals.length - kept.length;
  if (dropped > 0) {
    console.warn(
      `⚠️  Dropped ${dropped} record(s) outside pipeline "${pipelineId}" that the ` +
        `HubSpot filter let through. Not published.`
    );
  }
  return kept;
}

/** Load the local mock dataset used when no HubSpot token is present. */
export async function loadMockDeals() {
  const raw = await readFile(MOCK_PATH, 'utf8');
  return enforcePipeline(JSON.parse(raw).results || []);
}

export const hasToken = () => Boolean(config.hubspot.token);
