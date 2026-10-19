import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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

const SHELL_FOLDERS = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders';

// Windows variable names ignore case, so %userprofile% and %USERPROFILE% are the same.
const envValue = (env, name) => Object.entries(env).find(([key]) => key.toUpperCase() === name.toUpperCase())?.[1];

// The Windows Desktop can be moved, for example into OneDrive, so ask the registry where it is.
// A missing, unexpanded or garbled answer falls back to the usual %USERPROFILE%\Desktop.
export function windowsDesktop({ env = process.env, home = os.homedir(), run = spawnSync, exists = fs.existsSync } = {}) {
  const r = run('reg', ['query', SHELL_FOLDERS, '/v', 'Desktop'], { encoding: 'utf8', windowsHide: true });
  const match = r.status === 0 && /\bDesktop\s+REG_(?:EXPAND_)?SZ\s+(.+)/.exec(r.stdout ?? '');
  if (match) {
    const dir = match[1].trim().replace(/%([^%]+)%/g, (all, name) => envValue(env, name) ?? all);
    if (!dir.includes('%') && exists(dir)) return dir;
  }
  return path.win32.join(home, 'Desktop');
}

// The folder that holds timesheet.csv: on the Desktop on Windows, in the home folder elsewhere.
export function timesheetDir({ env = process.env, platform = process.platform, home = os.homedir(), run, exists } = {}) {
  if (platform === 'win32') return path.win32.join(windowsDesktop({ env, home, run, exists }), 'timesheets');
  return path.posix.join(home, 'timesheets');
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
