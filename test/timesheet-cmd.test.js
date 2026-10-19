import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmp } from '../test-fixtures/tmp.js';
import { isolateGit, git, initRepo, commitAt } from '../test-fixtures/git.js';
import { timesheetCommand } from '../src/timesheet-cmd.js';
import { HEADER, formatCsv } from '../src/timesheet/csv.js';
import { loadConfig, saveConfig } from '../src/config.js';

const noon = (h) => new Date(2026, 9, 18, h);
async function setup() {
  isolateGit('me@hydatis.com');
  const home = tmp();
  const repo = initRepo(path.join(home, 'work', 'pegasus'), 'me@hydatis.com');
  fs.mkdirSync(path.join(repo, 'src'));
  commitAt(repo, noon(12), 'feat: retire ms365');
  const claudeDir = path.join(tmp(), 'projects');
  fs.mkdirSync(path.join(claudeDir, 'p1'), { recursive: true });
  const line = (cwd, h, text) => JSON.stringify({ type: 'user', sessionId: 's1', cwd, timestamp: noon(h).toISOString(), message: { role: 'user', content: text } });
  fs.writeFileSync(path.join(claudeDir, 'p1', 's1.jsonl'), [line(path.join(repo, 'src'), 10, 'pourquoi ms365'), line(home, 11, 'divers'),
    JSON.stringify({ type: 'ai-title', aiTitle: 'MS365 failure', sessionId: 's1' })].join('\n'));
  return { home, repo: fs.realpathSync(repo), claudeDir, configDir: tmp(), csvPath: path.join(home, 'timesheets', 'timesheet.csv') };
}
async function run(args, deps) {
  const outs = [], errs = [];
  const code = await timesheetCommand(args, { ...deps, out: (m) => outs.push(m), err: (m) => errs.push(m) });
  return { code, outs, errs, json: outs.length ? JSON.parse(outs[0]) : null };
}

test('projects lists the day\'s projects, most active first', async () => {
  const d = await setup();
  const r = await run(['projects', '--date', '2026-10-18'], d);
  assert.equal(r.code, 0);
  assert.deepEqual(r.json, { projects: [
    { name: 'pegasus', path: d.repo, git: true, commits: 1, prompts: 1 },
    { name: '~', path: path.resolve(d.home), git: false, commits: 0, prompts: 1 },
  ], warnings: [] });
});

test('worktrees of one repo are one project', async () => {
  const d = await setup();
  const repo = path.join(d.home, 'work', 'pegasus');
  const visible = path.join(d.home, 'work', 'pegasus-feat');
  git(repo, ['worktree', 'add', '-q', '-b', 'feat', visible]);
  commitAt(visible, noon(13), 'feat: worktree');
  const hidden = path.join(repo, '.claude', 'worktrees', 'wt');
  git(repo, ['worktree', 'add', '-q', '-b', 'wt', hidden]);
  fs.writeFileSync(path.join(d.claudeDir, 'p1', 's2.jsonl'), JSON.stringify({ type: 'user', sessionId: 's2', cwd: hidden,
    timestamp: noon(15).toISOString(), message: { role: 'user', content: 'dans le worktree' } }));
  const j = (await run(['projects', '--date', '2026-10-18'], d)).json;
  assert.deepEqual(j.projects.filter((p) => p.git), [{ name: 'pegasus', path: d.repo, git: true, commits: 2, prompts: 2 }]);
});

test('collect gives commits and sessions, filtered by --project', async () => {
  const d = await setup();
  const all = (await run(['collect', '--date', '2026-10-18'], d)).json;
  assert.equal(all.date, '2026-10-18');
  assert.equal(all.truncated, false);
  assert.equal(all.projects[0].commits[0].subject, 'feat: retire ms365');
  assert.deepEqual(all.projects[0].sessions, [{ title: 'MS365 failure', prompts: [{ time: noon(10).toISOString(), text: 'pourquoi ms365' }] }]);
  const one = (await run(['collect', '--date', '2026-10-18', '--project', d.home, '--project', '/nope'], d)).json;
  assert.deepEqual(one.projects.map((p) => p.name), ['~']);
  assert.deepEqual(one.warnings, [`no activity on 2026-10-18 in ${path.resolve('/nope')}`]);
});

test('collect stops at 200 prompts', async () => {
  const d = await setup();
  const many = Array.from({ length: 201 }, (_, i) => JSON.stringify({ type: 'user', sessionId: 's9', cwd: d.home,
    timestamp: new Date(2026, 9, 18, 14, 0, i).toISOString(), message: { role: 'user', content: `p${i}` } }));
  fs.writeFileSync(path.join(d.claudeDir, 'p1', 's9.jsonl'), many.join('\n'));
  const j = (await run(['collect', '--date', '2026-10-18'], d)).json;
  assert.equal(j.truncated, true);
  assert.equal(j.projects.flatMap((p) => p.sessions.flatMap((s) => s.prompts)).length, 200);
});

test('collect stays under the output budget', async () => {
  const d = await setup();
  const many = Array.from({ length: 150 }, (_, i) => JSON.stringify({ type: 'user', sessionId: 's8', cwd: d.home,
    timestamp: new Date(2026, 9, 18, 16, 0, i).toISOString(), message: { role: 'user', content: 'x'.repeat(300) } }));
  fs.writeFileSync(path.join(d.claudeDir, 'p1', 's8.jsonl'), many.join('\n'));
  const r = await run(['collect', '--date', '2026-10-18'], d);
  assert.ok(r.outs[0].length <= 25000, String(r.outs[0].length));
  assert.equal(r.json.truncated, true);
});

test('collect drops commit bodies when the commits alone are over budget', async () => {
  const d = await setup();
  for (let i = 0; i < 60; i++) commitAt(path.join(d.home, 'work', 'pegasus'), new Date(2026, 9, 18, 13, i), `feat: ${i}\n\n${'b'.repeat(500)}`);
  const r = await run(['collect', '--date', '2026-10-18'], d);
  assert.ok(r.outs[0].length <= 25000, String(r.outs[0].length));
  assert.equal(r.json.truncated, true);
  assert.equal(r.json.projects[0].commits.length, 61);
  assert.ok(r.json.projects[0].commits.every((c) => c.body === ''));
});

test('warnings: no sessions folder, no email, broken repo', async () => {
  const d = await setup();
  initRepo(path.join(d.home, 'noemail'));
  fs.mkdirSync(path.join(d.home, 'broken', '.git'), { recursive: true });
  isolateGit();
  const none = path.join(tmp(), 'none');
  const r = await run(['projects', '--date', '2026-10-18'], { ...d, claudeDir: none });
  assert.equal(r.code, 0);
  assert.ok(r.json.warnings.includes(`no Claude Code sessions folder at ${none}`));
  assert.ok(r.json.warnings.some((w) => w.startsWith('git config user.email is not set; commits skipped in: ') && w.includes('noemail')));
});

test('git log failure is a warning', async () => {
  const d = await setup();
  fs.mkdirSync(path.join(d.home, 'broken', '.git'), { recursive: true });
  const r = await run(['projects', '--date', '2026-10-18'], d);
  assert.ok(r.json.warnings.includes(`git log failed in ${path.join(d.home, 'broken')}; skipped`));
});

test('git missing still lists session projects', async () => {
  const d = await setup();
  const saved = process.env.PATH;
  process.env.PATH = '';
  try {
    const r = await run(['projects', '--date', '2026-10-18'], d);
    assert.ok(r.json.warnings.includes('git not found; commits skipped'));
    assert.ok(r.json.projects.every((p) => p.commits === 0 && p.git === false));
  } finally {
    process.env.PATH = saved;
  }
});

test('bad date and unknown verb', async () => {
  const d = await setup();
  assert.deepEqual(await run(['projects', '--date', '18/10/2026'], d), { code: 1, outs: [], errs: ['timesheet: --date must be YYYY-MM-DD'], json: null });
  assert.deepEqual((await run(['bogus'], d)).errs, ['usage: timesheet.js projects|collect|write|roots']);
});

const entry = { date: '2026-10-18', projects: ['pegasus', '~'], title: "Retrait de l'app « Microsoft 365 »", description: 'Une, deux "trois".' };
const stdin = (v) => () => Promise.resolve(typeof v === 'string' ? v : JSON.stringify(v));

test('write appends, then reports exists, then replaces', async () => {
  const d = await setup();
  const w = await run(['write'], { ...d, readStdin: stdin(entry) });
  assert.equal(w.code, 0);
  assert.deepEqual(w.json, { status: 'written', path: d.csvPath, replaced: false });
  assert.equal(fs.readFileSync(d.csvPath, 'utf8'), formatCsv([HEADER, ['2026-10-18', 'pegasus; ~', entry.title, entry.description]]));
  const e = await run(['write'], { ...d, readStdin: stdin(entry) });
  assert.equal(e.code, 1);
  assert.deepEqual(e.json, { status: 'exists', path: d.csvPath });
  const r = await run(['write', '--replace'], { ...d, readStdin: stdin({ ...entry, title: 'Nouveau' }) });
  assert.deepEqual(r.json, { status: 'written', path: d.csvPath, replaced: true });
  assert.equal(fs.readFileSync(d.csvPath, 'utf8').split('\r\n').filter(Boolean).length, 2);
});

test('write rejects bad input', async () => {
  const d = await setup();
  const errOf = async (v) => (await run(['write'], { ...d, readStdin: stdin(v) })).errs;
  assert.deepEqual(await errOf('{'), ['timesheet: timesheet input is not valid JSON']);
  assert.deepEqual(await errOf({ ...entry, date: '18/10/2026' }), ['timesheet: bad timesheet field "date"']);
  assert.deepEqual(await errOf({ ...entry, projects: [] }), ['timesheet: bad timesheet field "projects"']);
  assert.deepEqual(await errOf({ ...entry, title: '  ' }), ['timesheet: bad timesheet field "title"']);
  assert.deepEqual(await errOf({ ...entry, description: undefined }), ['timesheet: bad timesheet field "description"']);
});

test('write leaves a file with other columns alone', async () => {
  const d = await setup();
  fs.mkdirSync(path.dirname(d.csvPath), { recursive: true });
  fs.writeFileSync(d.csvPath, 'date,hours\r\n');
  const r = await run(['write'], { ...d, readStdin: stdin(entry) });
  assert.equal(r.code, 1);
  assert.deepEqual(r.errs, [`timesheet: ${d.csvPath} has unexpected columns; not changed`]);
});

test('roots add, list and remove, keeping other settings', async () => {
  const d = await setup();
  saveConfig(d.configDir, { roots: [], note: 'kept' });
  fs.mkdirSync(path.join(d.home, 'clients'));
  const abs = path.join(d.home, 'clients');
  assert.deepEqual((await run(['roots', 'add', '~/clients'], d)).json, [abs]);
  assert.deepEqual((await run(['roots', 'add', abs], d)).json, [abs]);
  assert.deepEqual((await run(['roots'], d)).json, [abs]);
  assert.deepEqual(loadConfig(d.configDir), { roots: [abs], note: 'kept' });
  assert.deepEqual((await run(['roots', 'remove', abs], d)).json, []);
  assert.deepEqual((await run(['roots', 'remove', abs], d)).errs, [`timesheet: ${abs} is not a timesheet root`]);
  assert.deepEqual((await run(['roots', 'add', '~/missing'], d)).errs, [`timesheet: ${path.join(d.home, 'missing')} is not a folder`]);
});

test('roots outside home are scanned', async () => {
  const d = await setup();
  const client = initRepo(path.join(tmp(), 'client'), 'me@hydatis.com');
  commitAt(client, new Date(2026, 9, 18, 9), 'fix: client');
  await run(['roots', 'add', path.dirname(client)], d);
  const names = (await run(['projects', '--date', '2026-10-18'], d)).json.projects.map((p) => p.name);
  assert.ok(names.includes('client'));
});
