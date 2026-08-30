import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function loadTemplate(filename) {
  const templatePath = join(dirname(fileURLToPath(import.meta.url)), filename);
  return readFileSync(templatePath, 'utf8');
}

export function templateBody(markdown) {
  const parts = markdown.split(/\n---\n/);
  return parts.length > 1 ? parts.slice(1).join('\n---\n').trim() : markdown.trim();
}

export function fillTemplate(fields, markdown) {
  const body = templateBody(markdown);
  return body.replace(/\{\{([a-z0-9_]+)\}\}/g, (_, key) => escapeHtml(fields[key] ?? ''));
}

function inlineMarkdown(text) {
  return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function convertTable(block) {
  const rows = block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'));
  if (rows.length < 2) return `<p>${inlineMarkdown(block)}</p>`;
  const cells = rows
    .filter((line) => !/^\|[\s:-|]+\|$/.test(line))
    .map((line) =>
      line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim()),
    );
  const [header, ...body] = cells;
  const thead = `<tr>${header.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join('')}</tr>`;
  const tbody = body.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join('')}</tr>`).join('');
  return `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

export function markdownToHtml(markdown) {
  const blocks = markdown.split(/\n{2,}/);
  return blocks
    .map((block) => {
      const text = block.trim();
      if (!text) return '';
      if (text === '---') return '<hr />';
      if (text.startsWith('# ')) return `<h1>${inlineMarkdown(text.slice(2))}</h1>`;
      if (text.startsWith('## ')) return `<h2>${inlineMarkdown(text.slice(3))}</h2>`;
      if (text.includes('\n|') || text.startsWith('|')) return convertTable(text);
      const lines = text.split('\n').map((line) => {
        if (line.startsWith('- ')) return `<li>${inlineMarkdown(line.slice(2))}</li>`;
        return inlineMarkdown(line);
      });
      if (lines.every((line) => line.startsWith('<li>'))) return `<ul>${lines.join('')}</ul>`;
      return `<p>${lines.join('<br />')}</p>`;
    })
    .filter(Boolean)
    .join('\n');
}

export function wrapHtml(bodyHtml, title = 'Legal document') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: "Source Sans 3", "Segoe UI", sans-serif; color: #1a2330; margin: 1.25rem auto; max-width: 46rem; line-height: 1.45; }
    h1 { font-size: 1.35rem; color: #0d4a8c; margin: 1.4rem 0 0.6rem; text-align: center; text-transform: uppercase; letter-spacing: 0.04em; }
    h2 { font-size: 1.05rem; color: #0d4a8c; margin: 1.2rem 0 0.5rem; }
    p { margin: 0.65rem 0; }
    table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; font-size: 0.9rem; }
    th, td { border: 1px solid #d7dce2; padding: 0.35rem 0.5rem; text-align: left; }
    hr { border: 0; border-top: 1px solid #d7dce2; margin: 1.5rem 0; }
    .signature-block { margin-top: 2rem; }
    .print-hint { color: #5c646e; font-size: 0.9rem; margin-bottom: 1.5rem; }
    @media print { .print-hint { display: none; } body { margin: 0; max-width: none; } }
  </style>
</head>
<body>
  <p class="print-hint">Print this page and sign in person, or use the browser Save as PDF command to keep a copy.</p>
  ${bodyHtml}
</body>
</html>`;
}

export function buildFilledDocument({ templateFilename, fields, title }) {
  const markdown = loadTemplate(templateFilename);
  const filled = fillTemplate(fields, markdown);
  const html = wrapHtml(markdownToHtml(filled), title);
  return { fields, html, filled };
}
