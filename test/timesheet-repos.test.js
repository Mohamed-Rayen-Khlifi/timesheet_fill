import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmp } from '../test-fixtures/tmp.js';
import { isolateGit, git, initRepo, commitAt } from '../test-fixtures/git.js';
import { scanRepos, repoTop, projectName } from '../src/timesheet/repos.js';

const fakeRepo = (...parts) => fs.mkdirSync(path.join(...parts, '.git'), { recursive: true });

test('finds repos up to 4 levels, not deeper, not hidden, not in node_modules, not inside a repo', () => {
  const h = tmp();
  fakeRepo(h, 'a');
  fakeRepo(h, 'a', 'inner');
  fakeRepo(h, 'l1', 'l2', 'l3', 'l4');
  fakeRepo(h, 'l1', 'l2', 'l3', 'l4b', 'l5');
  fakeRepo(h, 'node_modules', 'pkg');
  fakeRepo(h, '.hidden', 'r');
  assert.deepEqual(scanRepos([h]), [path.join(h, 'a'), path.join(h, 'l1', 'l2', 'l3', 'l4')]);
});

test('a root that is itself a repo is still searched', () => {
  const h = tmp();
  fakeRepo(h);
  fakeRepo(h, 'a');
  assert.deepEqual(scanRepos([h]), [h, path.join(h, 'a')]);
});

test('extra roots are scanned and duplicates removed', () => {
  const h = tmp();
  fakeRepo(h, 'a');
  assert.deepEqual(scanRepos([h, path.join(h, 'a')]), [path.join(h, 'a')]);
});

test('AppData is skipped on Windows only', () => {
  const h = tmp();
  fakeRepo(h, 'AppData', 'r');
  assert.deepEqual(scanRepos([h], { platform: 'win32' }), []);
  assert.deepEqual(scanRepos([h], { platform: 'linux' }), [path.join(h, 'AppData', 'r')]);
});

test('an unreadable folder is skipped', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, () => {
  const h = tmp();
  fakeRepo(h, 'a');
  fs.mkdirSync(path.join(h, 'locked'));
  fs.chmodSync(path.join(h, 'locked'), 0o000);
  try {
    assert.deepEqual(scanRepos([h]), [path.join(h, 'a')]);
  } finally {
    fs.chmodSync(path.join(h, 'locked'), 0o755);
  }
});

test('repoTop resolves subfolders, also with spaces, and gives null outside a repo', () => {
  isolateGit();
  const r = initRepo(path.join(tmp(), 'my repo'), 'me@hydatis.com');
  fs.mkdirSync(path.join(r, 'src'));
  assert.equal(repoTop(path.join(r, 'src')), fs.realpathSync(r));
  assert.equal(repoTop(tmp()), null);
  assert.equal(repoTop(path.join(tmp(), 'gone')), null);
});

test('repoTop gives the main worktree for a linked worktree', () => {
  isolateGit();
  const main = initRepo(path.join(tmp(), 'app'), 'me@hydatis.com');
  commitAt(main, new Date(2026, 9, 18, 12), 'feat: un');
  const wt = path.join(main, '.claude', 'worktrees', 'x');
  git(main, ['worktree', 'add', '-q', '-b', 'x', wt]);
  assert.equal(repoTop(wt), fs.realpathSync(main));
});

test('projectName', () => {
  assert.equal(projectName('/h', '/h'), '~');
  assert.equal(projectName('/h/work/pegasus', '/h'), 'pegasus');
});
