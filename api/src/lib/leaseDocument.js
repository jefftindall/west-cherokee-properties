import { assembleLeaseFields, documentFilename, UNIT_LEASE_DEFAULTS } from './leaseTerms.js';
import { fillTemplate, loadTemplate, markdownToHtml, wrapHtml } from './legalDocument.js';

const LEASE_TEMPLATE = 'georgia-residential-lease-template.md';

export function loadLeaseTemplate() {
  return loadTemplate(LEASE_TEMPLATE);
}

export function leaseTemplateBody(markdown = loadLeaseTemplate()) {
  const parts = markdown.split(/\n---\n/);
  return parts.length > 1 ? parts.slice(1).join('\n---\n').trim() : markdown.trim();
}

export function fillLeaseTemplate(fields, markdown = loadLeaseTemplate()) {
  return fillTemplate(fields, markdown);
}

export function markdownToLeaseHtml(markdown) {
  return markdownToHtml(markdown);
}

export function wrapLeaseHtml(bodyHtml, title = 'Georgia Residential Lease Agreement') {
  return wrapHtml(bodyHtml, title);
}

export function buildLeaseDocument({ lease, person }) {
  const fields = assembleLeaseFields({ lease, person });
  const filled = fillLeaseTemplate(fields);
  const html = wrapLeaseHtml(markdownToLeaseHtml(filled));
  const unit = UNIT_LEASE_DEFAULTS[lease?.unitId] || {};
  return {
    fields,
    html,
    filename: documentFilename(lease, unit),
  };
}
