// Renders the static index.html from the transformed dispute data.
// Pure string templating — no framework, no client-side data fetching.

import { config } from './config.mjs';

const escapeHtml = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });

function statBlock(disputes) {
  const total = disputes.length;
  const open = disputes.filter((d) => d.state !== 'closed').length;
  const closed = disputes.filter((d) => d.state === 'closed').length;
  return `
      <dl class="stats" aria-label="Summary of matters">
        <div class="stat"><dt>Total Matters</dt><dd>${total}</dd></div>
        <div class="stat"><dt>Active</dt><dd>${open}</dd></div>
        <div class="stat"><dt>Closed</dt><dd>${closed}</dd></div>
      </dl>`;
}

function disputeCard(d) {
  const desc = d.description
    ? `<p class="matter__desc">${escapeHtml(d.description)}</p>`
    : '';
  // Amounts and closing dates are optional, so the meta grid is assembled from
  // whatever this matter actually has rather than padded with em dashes.
  const meta = [
    `<div><dt>Opened</dt><dd>${fmtDate(d.filed)}</dd></div>`,
    `<div><dt>Last Updated</dt><dd>${fmtDate(d.updated)}</dd></div>`,
  ];
  if (d.closed) meta.push(`<div><dt>Closed</dt><dd>${fmtDate(d.closed)}</dd></div>`);
  if (d.amount) meta.push(`<div><dt>Amount at Issue</dt><dd>${escapeHtml(d.amount)}</dd></div>`);

  return `
        <article class="matter" data-state="${escapeHtml(d.state)}" data-search="${escapeHtml(
          `${d.reference} ${d.subject} ${d.statusLabel}`.toLowerCase()
        )}">
          <header class="matter__head">
            <span class="matter__ref">${escapeHtml(d.reference)}</span>
            <span class="badge badge--${escapeHtml(d.state)}">${escapeHtml(d.statusLabel)}</span>
          </header>
          <h3 class="matter__title">${escapeHtml(d.subject)}</h3>
          ${desc}
          <dl class="matter__meta">
            ${meta.join('\n            ')}
          </dl>
        </article>`;
}

export function renderPage(disputes, meta) {
  const { site } = config;
  const year = new Date().getFullYear();

  const cards = disputes.length
    ? disputes.map(disputeCard).join('\n')
    : `<p class="empty">No matters are currently on the public record.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(site.brand)} — ${escapeHtml(site.title)}</title>
  <meta name="description" content="${escapeHtml(site.tagline)}" />
  <meta name="robots" content="index, follow" />
  <meta property="og:title" content="${escapeHtml(site.brand)} — ${escapeHtml(site.title)}" />
  <meta property="og:description" content="${escapeHtml(site.tagline)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://${escapeHtml(site.domain)}/" />
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <a class="skip" href="#matters">Skip to matters</a>
  <header class="site-header">
    <div class="wrap site-header__inner">
      <div class="brand">
        <span class="brand__mark" aria-hidden="true">MS</span>
        <span class="brand__text">
          <span class="brand__name">${escapeHtml(site.brand)}</span>
          <span class="brand__sub">${escapeHtml(site.title)}</span>
        </span>
      </div>
      <a class="contact-link" href="mailto:${escapeHtml(site.contactEmail)}">Contact Counsel</a>
    </div>
  </header>

  <main class="wrap" id="main">
    <section class="intro">
      <h1>Legal Disputes &amp; Matters</h1>
      <p class="lede">${escapeHtml(site.tagline)}</p>
      ${statBlock(disputes)}
    </section>

    <section class="controls" aria-label="Filter matters">
      <label class="search">
        <span class="search__label">Search matters</span>
        <input type="search" id="search" placeholder="Search by reference, party, or status…" autocomplete="off" />
      </label>
      <div class="filters" role="group" aria-label="Filter by status">
        <button class="filter is-active" data-filter="all" type="button">All</button>
        <button class="filter" data-filter="open" type="button">Identified</button>
        <button class="filter" data-filter="active" type="button">In Progress</button>
        <button class="filter" data-filter="waiting" type="button">On Hold</button>
        <button class="filter" data-filter="closed" type="button">Closed</button>
      </div>
    </section>

    <section class="matters" id="matters" aria-live="polite">
${cards}
    </section>
    <p class="no-results" id="no-results" hidden>No matters match your search.</p>
  </main>

  <footer class="site-footer">
    <div class="wrap">
      <p class="disclaimer">
        <strong>Disclaimer.</strong> The information on this page is provided for
        general transparency and record-keeping purposes only. It does not
        constitute legal advice, an admission, or a complete account of any
        matter, and nothing here creates an attorney–client relationship.
        Listing a matter is <strong>not</strong> an allegation of wrongdoing by
        any party, and a status of &ldquo;Closed&rdquo; implies no finding of
        liability or fault. Statuses reflect internal record-keeping and may lag
        the actual posture of a matter. For inquiries regarding a specific
        matter, or to request correction or removal of an entry, contact
        <a href="mailto:${escapeHtml(site.contactEmail)}">${escapeHtml(site.contactEmail)}</a>.
      </p>
      <p class="meta-line">
        &copy; ${year} ${escapeHtml(site.brand)}. Records generated
        <time datetime="${escapeHtml(meta.generatedAt)}">${fmtDateTime(meta.generatedAt)}</time>
        · Source: ${escapeHtml(meta.source)}
      </p>
    </div>
  </footer>

  <script src="./app.js" defer></script>
</body>
</html>
`;
}
