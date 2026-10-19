import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FILE = 'config.json';

// Per-user config directory. Uses the target platform's path rules so it can be
// computed (and tested) for Windows while running on Linux and vice versa.
export function configDir({ env = process.env, platform = process.platform, home = os.homedir() } = {}) {
  if (platform === 'win32') {
    const appData = env.APPDATA || path.win32.join(home, 'AppData', 'Roaming');
    return path.win32.join(appData, 'timesheet_fill');
  }
  const base = env.XDG_CONFIG_HOME || path.posix.join(home, '.config');
  return path.posix.join(base, 'timesheet_fill');
}

// A missing file means no settings yet; an unreadable one is kept as config.json.bak.
export function loadConfig(dir) {
  const file = path.join(dir, FILE);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { roots: [] };
    throw err;
  }
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.roots)) throw new Error('bad shape');
    return parsed;
  } catch {
    fs.renameSync(file, path.join(dir, `${FILE}.bak`));
    return { roots: [] };
  }
}

export function saveConfig(dir, config) {
  fs.mkdirSync(dir, { recursive: true });
  const tmpFile = path.join(dir, `${FILE}.tmp`);
  fs.writeFileSync(tmpFile, JSON.stringify(config, null, 2) + '\n');
  fs.renameSync(tmpFile, path.join(dir, FILE));
}
