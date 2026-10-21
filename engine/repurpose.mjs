#!/usr/bin/env node
// Local, deterministic source-to-social draft generator. No dependencies or API keys.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function option(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const input = path.resolve(option('--input', path.join(ROOT, 'engine/sample_input.md')));
const out = path.resolve(option('--out', path.join(ROOT, 'output')));
const plans = [
  ['LinkedIn','Text post','The useful idea hiding in this source'],
  ['LinkedIn','Document carousel','A practical sequence to try'],
  ['LinkedIn','Question post','A question this source helps answer'],
  ['Instagram','Carousel','A saveable step-by-step explainer'],
  ['Instagram','Reel script','A 30-second visual explanation'],
  ['Instagram','Story sequence','Three frames: problem, tip, question'],
  ['YouTube Shorts','Short video script','One takeaway, shown clearly'],
  ['YouTube Shorts','Short video script','A common mistake and a correction'],
  ['X','Thread','A concise thread of useful points'],
  ['Reddit','Discussion prompt','A transparent, non-promotional discussion'],
];

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
function parseCsvLine(line) {
  const out = []; let cell = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted && c === '"' && line[i + 1] === '"') { cell += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { out.push(cell); cell = ''; }
    else cell += c;
  }
  out.push(cell); return out;
}
function parseSentences(text) {
  const clean = text.replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)|\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/[#>*_`]+/g, ' ');
  return [...new Set(clean.split(/(?<=[.!?])\s+|\n+/)
    .map(x => x.replace(/\s+/g, ' ').replace(/^[\s-]+|[\s-]+$/g, ''))
    .filter(x => x.length >= 35))];
}

async function main() {
  const started = performance.now();
  try {
    const source = await readFile(input, 'utf8');
    const ideas = parseSentences(source);
    if (!ideas.length) throw new Error('No usable sentences found; provide a longer text input.');
    const digest = createHash('sha256').update(source).digest('hex').slice(0, 16);
    const fields = ['asset_id','platform','format','hook','draft','source_digest','status'];
    const rows = plans.map(([platform, format, angle], i) => {
      const idea = ideas[i % ideas.length];
      const assetId = `ENG-${createHash('sha256').update(`${digest}:${i}`).digest('hex').slice(0, 10).toUpperCase()}`;
      const hook = idea.length > 115 ? `${idea.slice(0, 115).trimEnd()}…` : idea;
      const draft = `${angle}: ${idea}\n\nAdapt this draft to the native format, verify it against the original source, add accessibility text, and finish with one relevant question or action.`;
      return { asset_id: assetId, platform, format, hook, draft, source_digest: digest, status: 'Draft — human review required' };
    });
    await mkdir(out, { recursive: true });
    const assetsPath = path.join(out, 'assets.csv');
    let previous = new Map();
    try {
      const old = (await readFile(assetsPath, 'utf8')).replace(/^\uFEFF/, '').trim().split(/\r?\n/);
      if (old.length > 1) {
        const keys = parseCsvLine(old[0]);
        for (const line of old.slice(1)) {
          const vals = parseCsvLine(line); const row = Object.fromEntries(keys.map((k, i) => [k, vals[i] ?? '']));
          if (row.asset_id) previous.set(row.asset_id, row);
        }
      }
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
    for (const row of rows) previous.set(row.asset_id, row);
    const allRows = [...previous.values()];
    await writeFile(assetsPath, [fields.join(','), ...allRows.map(r => fields.map(k => csvCell(r[k])).join(','))].join('\n') + '\n', 'utf8');
    const calendarFields = ['asset_id','platform','format','hook','draft','status','scheduled_at'];
    await writeFile(path.join(out, 'calendar.csv'), [calendarFields.join(','), ...allRows.map(r => calendarFields.map(k => csvCell(k === 'scheduled_at' ? '' : r[k])).join(','))].join('\n') + '\n', 'utf8');
    console.log(`Generated/refreshed ${rows.length} drafts from ${input}; ${allRows.length} unique assets in ${out}.`);
    console.log(`Runtime: ${((performance.now() - started) / 1000).toFixed(3)}s; external API cost: $0 (local deterministic workflow).`);
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
main();
