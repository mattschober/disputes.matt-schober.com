// Build entrypoint: fetch legal-dispute data from HubSpot (or mock), transform
// it into a public-safe shape, and emit a fully static site into dist/.
//
//   node scripts/build.mjs
//
// In CI this is run as `doppler run -- node scripts/build.mjs`, so Doppler
// injects HUBSPOT_TOKEN (and any SITE_* overrides) into the environment.

import { mkdir, writeFile, copyFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  config,
  FALLBACK_STAGES,
  PRIORITY_LABELS,
  CATEGORY_LABELS,
  stateForStageLabel,
} from './config.mjs';
import {
  fetchTickets,
  fetchPipelineStages,
  loadMockTickets,
  hasToken,
} from './hubspot.mjs';
import { renderPage } from './render.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');
const SRC = join(ROOT, 'src');

/** Strip HTML tags and collapse whitespace from HubSpot rich-text content. */
function toPlainText(html = '') {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Build a public reference number that never exposes the raw record id. */
function referenceFor(id) {
  const digits = String(id).replace(/\D/g, '');
  const tail = digits.slice(-6).padStart(6, '0');
  return `${config.publish.referencePrefix}-${tail}`;
}

/** Map a HubSpot ticket into the public dispute shape used by the template. */
function toDispute(ticket, stageMap) {
  const p = ticket.properties || {};
  const stageId = p.hs_pipeline_stage;

  let statusLabel;
  let state;
  if (stageMap && stageMap[stageId]) {
    statusLabel = stageMap[stageId].label;
    state = stateForStageLabel(statusLabel);
  } else if (FALLBACK_STAGES[stageId]) {
    statusLabel = FALLBACK_STAGES[stageId].label;
    state = FALLBACK_STAGES[stageId].state;
  } else {
    statusLabel = 'On Record';
    state = 'open';
  }

  const description = config.publish.includeDescriptions
    ? toPlainText(p.content || '')
    : '';

  return {
    reference: referenceFor(p.hs_object_id || ticket.id),
    subject: p.subject || 'Untitled Matter',
    description,
    statusLabel,
    state,
    priority: PRIORITY_LABELS[p.hs_ticket_priority] || '—',
    category: CATEGORY_LABELS[p.hs_ticket_category] || 'General',
    filed: p.createdate || null,
    updated: p.hs_lastmodifieddate || null,
  };
}

async function copyStatic() {
  const files = await readdir(SRC);
  await Promise.all(files.map((f) => copyFile(join(SRC, f), join(DIST, f))));

  // Preserve the custom-domain file for GitHub Pages.
  if (existsSync(join(ROOT, 'CNAME'))) {
    await copyFile(join(ROOT, 'CNAME'), join(DIST, 'CNAME'));
  }
}

async function main() {
  const live = hasToken();
  console.log(live
    ? '🔐 HUBSPOT_TOKEN detected — fetching live data from HubSpot.'
    : 'ℹ️  No HUBSPOT_TOKEN — building from mock/tickets.sample.json.');

  let tickets;
  let stageMap = null;
  if (live) {
    [tickets, stageMap] = await Promise.all([fetchTickets(), fetchPipelineStages()]);
  } else {
    tickets = await loadMockTickets();
  }

  const disputes = tickets
    .map((t) => toDispute(t, stageMap))
    .sort((a, b) => new Date(b.filed || 0) - new Date(a.filed || 0));

  const meta = {
    generatedAt: new Date().toISOString(),
    source: live ? 'HubSpot (live)' : 'sample data',
    count: disputes.length,
  };

  await mkdir(DIST, { recursive: true });
  await copyStatic();
  await writeFile(join(DIST, 'index.html'), renderPage(disputes, meta), 'utf8');
  // Machine-readable copy for transparency / future consumers.
  await writeFile(
    join(DIST, 'data.json'),
    JSON.stringify({ meta, disputes }, null, 2),
    'utf8'
  );

  console.log(`✅ Built ${disputes.length} matter(s) → ${DIST}`);
}

main().catch((err) => {
  console.error('❌ Build failed:', err.message);
  process.exit(1);
});
