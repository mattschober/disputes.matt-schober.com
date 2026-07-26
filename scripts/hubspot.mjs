// HubSpot data access for the disputes build.
//
// No SDK: uses native fetch (Node >= 18). All network access is server-side at
// build time — the access token never reaches the browser.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK_PATH = join(__dirname, '..', 'mock', 'tickets.sample.json');

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
    throw new Error(
      `HubSpot ${options.method || 'GET'} ${path} failed: ${res.status} ${res.statusText}\n${body}`
    );
  }
  return res.json();
}

/**
 * Fetch stage id -> { label, order } for the configured ticket pipeline.
 * Returns null on any failure so callers can fall back to defaults.
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
    console.warn(`⚠️  Could not fetch pipeline stages: ${err.message}`);
    return null;
  }
}

/**
 * Fetch all tickets for the configured pipeline, following pagination.
 * Applies the marker-based publication filter server-side when required.
 */
export async function fetchTickets() {
  const { hubspot, publish } = config;

  const filters = [];
  if (publish.restrictToPipeline) {
    filters.push({
      propertyName: 'hs_pipeline',
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

  return results;
}

/** Load the local mock dataset used when no HUBSPOT_TOKEN is present. */
export async function loadMockTickets() {
  const raw = await readFile(MOCK_PATH, 'utf8');
  return JSON.parse(raw).results || [];
}

export const hasToken = () => Boolean(config.hubspot.token);
