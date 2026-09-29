#!/usr/bin/env node
// Fails if any test code uses fixed sleeps. Reviewers grade "no fixed sleeps".
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['ui-tests', 'api-tests', 'support', 'playwright.config.ts'];
const BANNED = [
  { re: /\bwaitForTimeout\s*\(/, why: 'page.waitForTimeout (fixed sleep)' },
  { re: /new\s+Promise\s*\(\s*\(?\s*\w*\s*\)?\s*=>\s*setTimeout\b/, why: 'Promise+setTimeout sleep' },
  { re: /(?<![.\w])setTimeout\s*\(/, why: 'setTimeout (likely a sleep); test.setTimeout is fine' },
  { re: /\bsleep\s*\(/, why: 'sleep()' },
  { re: /timers\/promises/, why: 'node:timers/promises (setTimeout sleep)' },
];
const root = process.cwd();
const files = [];
const walk = (p) => {
  const st = statSync(p, { throwIfNoEntry: false });
  if (!st) return;
  if (st.isDirectory()) readdirSync(p).forEach((f) => f !== 'node_modules' && walk(join(p, f)));
  else if (/\.(ts|mts|js|mjs)$/.test(p)) files.push(p);
};
ROOTS.forEach((r) => walk(join(root, r)));

const hits = [];
for (const f of files) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    for (const { re, why } of BANNED) if (re.test(code)) { hits.push(`${relative(root, f)}:${i + 1}  ${why}\n    ${line.trim()}`); break; }
  });
}
if (hits.length) {
  console.error(`lint:nosleep FAILED (${hits.length}):\n` + hits.join('\n'));
  console.error('Use web-first assertions, expect.poll, or waitForResponse instead.');
  process.exit(1);
}
console.log(`lint:nosleep OK: ${files.length} files, no fixed sleeps.`);
