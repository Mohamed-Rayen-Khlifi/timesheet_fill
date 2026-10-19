import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const skipped = (name, platform) => name.startsWith('.') || name === 'node_modules' || (platform === 'win32' && name === 'AppData');

// Git repos under each root, at most maxDepth levels down. A repo is not searched further,
// except a root itself (a home folder kept in git still holds other repos).
export function scanRepos(roots, { maxDepth = 4, platform = process.platform } = {}) {
  const found = new Set();
  const walk = (dir, depth) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((e) => e.name === '.git')) {
      found.add(dir);
      if (depth > 0) return;
    }
    if (depth === maxDepth) return;
    for (const e of entries) {
      if (e.isDirectory() && !skipped(e.name, platform)) walk(path.join(dir, e.name), depth + 1);
    }
  };
  for (const root of roots) walk(path.resolve(root), 0);
  return [...found].sort();
}

// The repo's main worktree, so every linked worktree of one repo is one project.
export function repoTop(dir) {
  const r = spawnSync('git', ['-C', dir, 'rev-parse', '--path-format=absolute', '--git-common-dir', '--show-toplevel'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const [common, top] = r.stdout.trim().split(/\r?\n/);
  if (!common || !top) return null;
  return path.resolve(path.basename(common) === '.git' ? path.dirname(common) : top);
}

export function projectName(dir, home) {
  return path.resolve(dir) === path.resolve(home) ? '~' : path.basename(dir);
}
