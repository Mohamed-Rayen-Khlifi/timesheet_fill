import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmp } from './tmp.js';

// Points git at a fresh global config, so the developer's own git settings never leak into tests.
export function isolateGit(email) {
  const file = path.join(tmp(), 'gitconfig');
  fs.writeFileSync(file, email ? `[user]\n\temail = ${email}\n` : '');
  process.env.GIT_CONFIG_GLOBAL = file;
  process.env.GIT_CONFIG_NOSYSTEM = '1';
}

export function git(dir, args, date, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  if (date) env.GIT_AUTHOR_DATE = env.GIT_COMMITTER_DATE = date.toISOString();
  return execFileSync('git', ['-C', dir, ...args], { env, encoding: 'utf8' });
}

export function initRepo(dir, email) {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.name', 'Test']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  if (email) git(dir, ['config', 'user.email', email]);
  return dir;
}

let counter = 0;

export function commitAt(dir, date, message, { email, files = ['f.txt'] } = {}) {
  for (const file of files) fs.writeFileSync(path.join(dir, file), `${++counter}\n`);
  git(dir, ['add', '-A'], date);
  git(dir, ['commit', '-q', '-m', message], date, email ? { GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_EMAIL: email } : {});
}
