import { spawnSync } from 'node:child_process';

const MAX_BODY = 500;
// Record separator before each commit, unit separator after each field, then git's --shortstat line.
const FORMAT = '--format=%x1e%ae%x1f%aI%x1f%s%x1f%b%x1f';

const runGit = (args) => spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

export function hasGit() {
  return runGit(['--version']).error?.code !== 'ENOENT';
}

export function repoEmail(repo) {
  const r = runGit(['-C', repo, 'config', 'user.email']);
  const email = r.status === 0 ? r.stdout.trim() : '';
  return email || null;
}

// The user's non-merge commits on any branch whose author date falls in [start, end).
// Stashes are commits under refs/stash, so they are excluded (the exclude must come before --all).
export function dayCommits(repo, { start, end, email }) {
  const r = runGit(['-C', repo, 'log', '--exclude=refs/stash', '--all', '--no-merges', `--since=${start.toISOString()}`, '--shortstat', FORMAT]);
  if (r.error || r.status !== 0) throw new Error(`git log failed in ${repo}`);
  const me = email.toLowerCase();
  return r.stdout.split('\x1e').slice(1)
    .map((chunk) => {
      const [ae, aI, subject, body, rest] = chunk.split('\x1f');
      return { ae, time: aI, subject, body: body.trim().slice(0, MAX_BODY), files: Number(/(\d+) files? changed/.exec(rest)?.[1] ?? 0) };
    })
    .filter((c) => c.ae.toLowerCase() === me && new Date(c.time) >= start && new Date(c.time) < end)
    .map(({ ae: _ae, ...c }) => c)
    .sort((a, b) => new Date(a.time) - new Date(b.time));
}
