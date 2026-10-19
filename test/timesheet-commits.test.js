import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmp } from '../test-fixtures/tmp.js';
import { isolateGit, git, initRepo, commitAt } from '../test-fixtures/git.js';
import { dayWindow } from '../src/timesheet/day.js';
import { hasGit, repoEmail, dayCommits } from '../src/timesheet/commits.js';

const noon = (day, h = 12) => new Date(2026, 9, day, h);
const win = dayWindow('2026-10-18');
const ME = 'me@hydatis.com';

test('only my commits from that day, on any branch, without merges', () => {
  isolateGit();
  const r = initRepo(path.join(tmp(), 'repo'), ME);
  commitAt(r, noon(17), 'hier');
  commitAt(r, noon(18), 'feat: un');
  commitAt(r, noon(18, 13), 'autre', { email: 'other@hydatis.com' });
  git(r, ['checkout', '-q', '-b', 'side']);
  commitAt(r, noon(18, 14), 'feat: branche');
  git(r, ['checkout', '-q', 'main']);
  git(r, ['merge', '-q', '--no-ff', '-m', 'merge side', 'side'], noon(18, 15));
  commitAt(r, noon(19), 'demain');
  assert.deepEqual(dayCommits(r, { ...win, email: ME }).map((c) => c.subject), ['feat: un', 'feat: branche']);
});

test('stashes are not commits', () => {
  isolateGit();
  const r = initRepo(path.join(tmp(), 'repo'), ME);
  commitAt(r, noon(18), 'feat: un');
  fs.writeFileSync(path.join(r, 'f.txt'), 'wip\n');
  fs.writeFileSync(path.join(r, 'new.txt'), 'wip\n');
  git(r, ['stash', 'push', '-q', '-u'], noon(18, 13));
  assert.deepEqual(dayCommits(r, { ...win, email: ME }).map((c) => c.subject), ['feat: un']);
});

test('commit fields; email match ignores case', () => {
  isolateGit();
  const r = initRepo(path.join(tmp(), 'repo'), ME);
  commitAt(r, noon(18), `feat: deux\n\n${'x'.repeat(600)}`, { files: ['a.txt', 'b.txt'] });
  const [c] = dayCommits(r, { ...win, email: 'Me@Hydatis.com' });
  assert.equal(c.subject, 'feat: deux');
  assert.equal(c.body.length, 500);
  assert.equal(c.files, 2);
  assert.equal(new Date(c.time).getTime(), noon(18).getTime());
});

test('a repo with no commits yet has none', () => {
  isolateGit();
  assert.deepEqual(dayCommits(initRepo(path.join(tmp(), 'empty'), ME), { ...win, email: ME }), []);
});

test('a folder that is not a repo throws', () => {
  isolateGit();
  const d = tmp();
  assert.throws(() => dayCommits(d, { ...win, email: ME }), { message: `git log failed in ${d}` });
});

test('repoEmail reads the repo config and falls back to null', () => {
  isolateGit();
  assert.equal(repoEmail(initRepo(path.join(tmp(), 'a'), ME)), ME);
  assert.equal(repoEmail(initRepo(path.join(tmp(), 'b'))), null);
  assert.equal(hasGit(), true);
});
