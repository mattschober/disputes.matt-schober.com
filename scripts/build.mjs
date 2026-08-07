// Build entrypoint: fetch legal-dispute data from HubSpot (or mock), transform
// it into a public-safe shape, and emit a fully static site into dist/.
//
//   node scripts/build.mjs
//
// In CI this is run as `doppler run -- node scripts/build.mjs`, so Doppler
// injects HUBSPOT_SERVICE_KEY (and any SITE_*/PUBLISH_* overrides) into the
// environment.

import { mkdir, writeFile, copyFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  config,
  FALLBACK_STAGES,
  STAGE_LABEL_OVERRIDES,
  stateForStageLabel,
} from './config.mjs';
import {
  fetchDisputeDeals,
  fetchPipelineStages,
  loadMockDeals,
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

/** Format a deal amount as a plain USD figure, or null when not publishable. */
function amountFor(raw) {
  if (!config.publish.includeAmounts) return null;
  const n = Number(raw);
  if (!raw || Number.isNaN(n) || n <= 0) return null;
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

/** Resolve a stage id to its public label and semantic state. */
function stageFor(stageId, stageMap) {
  const override = STAGE_LABEL_OVERRIDES[stageId];

  if (stageMap && stageMap[stageId]) {
    const label = override || stageMap[stageId].label;
    // State always derives from HubSpot's real label, not the public override,
    // so "Closed Won" still colours as closed after being relabelled.
    return { statusLabel: label, state: stateForStageLabel(stageMap[stageId].label) };
  }
  if (FALLBACK_STAGES[stageId]) {
    const { label, state } = FALLBACK_STAGES[stageId];
    return { statusLabel: override || label, state };
  }
  return { statusLabel: 'On Record', state: 'open' };
}

/** Map a HubSpot deal into the public dispute shape used by the template. */
function toDispute(deal, stageMap) {
  const p = deal.properties || {};
  const { statusLabel, state } = stageFor(p.dealstage, stageMap);

  return {
    reference: referenceFor(p.hs_object_id || deal.id),
    subject: p.dealname || 'Untitled Matter',
    description: config.publish.includeDescriptions ? toPlainText(p.description || '') : '',
    statusLabel,
    state,
    amount: amountFor(p.amount),
    filed: p.createdate || null,
    updated: p.hs_lastmodifieddate || null,
    closed: state === 'closed' ? p.closedate || null : null,
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
    ? '🔐 HUBSPOT_SERVICE_KEY detected — fetching live data from HubSpot.'
    : 'ℹ️  No HUBSPOT_SERVICE_KEY — building from mock/disputes.sample.json.');

  let deals;
  let stageMap = null;
  if (live) {
    // Stage labels are optional, so fetch them first and let a scope failure
    // there degrade to built-in labels rather than racing the required call.
    stageMap = await fetchPipelineStages();
    deals = await fetchDisputeDeals();
  } else {
    deals = await loadMockDeals();
  }

  const disputes = deals
    .map((d) => toDispute(d, stageMap))
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

  console.log(
    `✅ Built ${disputes.length} matter(s) → ${DIST}` +
      `\n   descriptions: ${config.publish.includeDescriptions ? 'published' : 'withheld'}` +
      `, amounts: ${config.publish.includeAmounts ? 'published' : 'withheld'}`
  );
}

main().catch((err) => {
  console.error(`❌ Build failed: ${err.message}`);
  // Exit non-zero so the deploy job is skipped and the last good site stays up.
  process.exit(1);
});
