import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmp } from '../test-fixtures/tmp.js';
import { dayWindow } from '../src/timesheet/day.js';
import { sessionsDir, readSessions } from '../src/timesheet/sessions.js';

const at = (day, h) => new Date(2026, 9, day, h).toISOString();
const rec = (o) => JSON.stringify({ type: 'user', sessionId: 's1', cwd: '/w/pegasus', isSidechain: false,
  timestamp: at(18, 10), message: { role: 'user', content: 'x' }, ...o });
const msg = (content) => ({ message: { role: 'user', content } });
const win = dayWindow('2026-10-18');
function sessionsWith(lines, mtime) {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'p1'));
  const f = path.join(dir, 'p1', 's1.jsonl');
  fs.writeFileSync(f, lines.join('\n') + '\n');
  if (mtime) fs.utimesSync(f, mtime, mtime);
  return dir;
}

test('dayWindow is local midnight to midnight', () => {
  assert.deepEqual(dayWindow('2026-10-18'), { start: new Date(2026, 9, 18), end: new Date(2026, 9, 19) });
  assert.deepEqual(dayWindow('2026-03-29').end, new Date(2026, 2, 30));
  for (const bad of ['18/10/2026', '2026-02-30', '2026-1-5', ''])
    assert.throws(() => dayWindow(bad), { message: '--date must be YYYY-MM-DD' });
});

test('keeps only typed prompts from the day', async () => {
  const dir = sessionsWith([
    rec(msg('supprime ms365')),
    rec({ isMeta: true, ...msg('meta') }),
    rec(msg('<command-name>/mcp</command-name>')),
    rec(msg('<local-command-stdout>x</local-command-stdout>')),
    rec(msg('Caveat: x')),
    rec(msg([{ type: 'tool_result', content: 'r' }])),
    rec({ isSidechain: true, ...msg('agent') }),
    rec({ timestamp: at(17, 10), ...msg('hier') }),
    '{not json',
    JSON.stringify({ type: 'ai-title', aiTitle: 'Old', sessionId: 's1' }),
    JSON.stringify({ type: 'ai-title', aiTitle: 'MS365 failure', sessionId: 's1' }),
    JSON.stringify({ type: 'ai-title', aiTitle: 'Other', sessionId: 's2' }),
  ]);
  assert.deepEqual(await readSessions(dir, win), {
    found: true,
    prompts: [{ time: at(18, 10), cwd: '/w/pegasus', sessionId: 's1', text: 'supprime ms365' }],
    titles: { s1: 'MS365 failure' },
  });
});

test('long prompts are cut to 300 characters', async () => {
  const r = await readSessions(sessionsWith([rec(msg('a'.repeat(400)))]), win);
  assert.equal(r.prompts[0].text.length, 300);
});

test('files last modified before the day are not read', async () => {
  const r = await readSessions(sessionsWith([rec(msg('vieux'))], new Date(2026, 9, 16)), win);
  assert.deepEqual(r.prompts, []);
});

test('missing sessions folder', async () => {
  assert.deepEqual(await readSessions(path.join(tmp(), 'nope'), win), { found: false, prompts: [], titles: {} });
});

test('sessionsDir honours CLAUDE_CONFIG_DIR', () => {
  assert.equal(sessionsDir({ env: { CLAUDE_CONFIG_DIR: '/c' }, home: '/h' }), path.join('/c', 'projects'));
  assert.equal(sessionsDir({ env: {}, home: '/h' }), path.join('/h', '.claude', 'projects'));
});
