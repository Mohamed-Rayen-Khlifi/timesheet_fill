import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { configDir as defaultConfigDir, loadConfig, saveConfig, timesheetDir } from './config.js';
import { dayWindow } from './timesheet/day.js';
import { writeRow } from './timesheet/csv.js';
import { sessionsDir, readSessions } from './timesheet/sessions.js';
import { hasGit, repoEmail, dayCommits } from './timesheet/commits.js';
import { scanRepos, repoTop, projectName } from './timesheet/repos.js';

const USAGE = 'usage: timesheet.js projects|collect|write|roots';
const MAX_PROMPTS = 200;
const OUTPUT_BUDGET = 25000;
const OPTIONS = { date: { type: 'string' }, project: { type: 'string', multiple: true }, replace: { type: 'boolean' } };

const realPath = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
};

// Everything the user did on one day, grouped by project. Git projects are keyed by real path,
// so a repo found by the scan and through a session's folder is one project.
export async function gatherDay(date, { home, claudeDir, roots = [] }) {
  const window = dayWindow(date);
  const warnings = [];
  const sessions = await readSessions(claudeDir, window);
  if (!sessions.found) warnings.push(`no Claude Code sessions folder at ${claudeDir}`);
  const git = hasGit();
  if (!git) warnings.push('git not found; commits skipped');

  const projects = new Map();
  const project = (p, isGit) => {
    if (!projects.has(p)) projects.set(p, { name: projectName(p, home), path: p, git: isGit, commits: [], prompts: [] });
    return projects.get(p);
  };

  const folders = new Map();
  for (const prompt of sessions.prompts) {
    if (!folders.has(prompt.cwd)) {
      const top = git ? repoTop(prompt.cwd) : null;
      folders.set(prompt.cwd, top ? { path: realPath(top), git: true } : { path: path.resolve(prompt.cwd), git: false });
    }
    const f = folders.get(prompt.cwd);
    project(f.path, f.git).prompts.push(prompt);
  }

  if (git) {
    const repos = new Map();
    for (const repo of scanRepos([home, ...roots])) {
      const top = repoTop(repo);
      const key = realPath(top ?? repo);
      if (!repos.has(key)) repos.set(key, top ?? repo);
    }
    for (const f of folders.values()) if (f.git && !repos.has(f.path)) repos.set(f.path, f.path);
    const noEmail = [];
    for (const [key, repo] of repos) {
      const email = repoEmail(repo);
      if (!email) {
        noEmail.push(repo);
        continue;
      }
      let commits;
      try {
        commits = dayCommits(repo, { ...window, email });
      } catch {
        warnings.push(`git log failed in ${repo}; skipped`);
        continue;
      }
      if (commits.length) project(key, true).commits.push(...commits);
    }
    if (noEmail.length) warnings.push(`git config user.email is not set; commits skipped in: ${noEmail.join(', ')}`);
  }

  const activity = (p) => p.commits.length + p.prompts.length;
  const list = [...projects.values()].sort((a, b) => activity(b) - activity(a) || a.name.localeCompare(b.name));
  return { projects: list, titles: sessions.titles, warnings };
}

function projectsView(day) {
  return {
    projects: day.projects.map(({ name, path: p, git, commits, prompts }) => ({ name, path: p, git, commits: commits.length, prompts: prompts.length })),
    warnings: day.warnings,
  };
}

function collectView(date, day, wanted = []) {
  const warnings = [...day.warnings];
  let projects = day.projects;
  if (wanted.length) {
    const paths = wanted.map((p) => realPath(path.resolve(p)));
    for (const p of paths) if (!projects.some((x) => x.path === p)) warnings.push(`no activity on ${date} in ${p}`);
    projects = projects.filter((x) => paths.includes(x.path));
  }
  // The output must fit in what Claude sees of a Bash result: commit bodies go first, then prompts.
  let truncated = false;
  const view = projects.map(({ name, path: p, git, commits }) => ({ name, path: p, git, commits, sessions: [] }));
  const sizeOf = () => JSON.stringify({ date, projects: view, truncated: false, warnings }).length;
  let size = sizeOf();
  if (size > OUTPUT_BUDGET) {
    for (const v of view) v.commits = v.commits.map((c) => ({ ...c, body: '' }));
    truncated = true;
    size = sizeOf();
  }
  let count = 0;
  projects.forEach(({ prompts }, i) => {
    const bySession = new Map();
    for (const { sessionId, time, text } of prompts) {
      const item = { time, text };
      const added = bySession.has(sessionId) ? item : { title: day.titles[sessionId] ?? null, prompts: [item] };
      const cost = JSON.stringify(added).length + 1;
      if (count === MAX_PROMPTS || size + cost > OUTPUT_BUDGET) {
        truncated = true;
        break;
      }
      count++;
      size += cost;
      if (!bySession.has(sessionId)) bySession.set(sessionId, []);
      bySession.get(sessionId).push(item);
    }
    view[i].sessions = [...bySession].map(([id, list]) => ({ title: day.titles[id] ?? null, prompts: list }));
  });
  return { date, projects: view, truncated, warnings };
}

const isDate = (v) => {
  try {
    dayWindow(v);
    return true;
  } catch {
    return false;
  }
};
const isText = (v) => typeof v === 'string' && v.trim() !== '';

function badField(input) {
  if (typeof input?.date !== 'string' || !isDate(input.date)) return 'date';
  if (!Array.isArray(input.projects) || input.projects.length === 0 || !input.projects.every(isText)) return 'projects';
  return ['title', 'description'].find((field) => !isText(input[field])) ?? null;
}

async function writeVerb(replace, { csvPath, readStdin, out, err }) {
  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    err('timesheet: timesheet input is not valid JSON');
    return 1;
  }
  const bad = badField(input);
  if (bad) {
    err(`timesheet: bad timesheet field "${bad}"`);
    return 1;
  }
  const row = { date: input.date, projects: input.projects.join('; '), title: input.title, description: input.description };
  let result;
  try {
    result = writeRow(csvPath, row, { replace });
  } catch (e) {
    err(`timesheet: ${e.message}`);
    return 1;
  }
  if (result.status === 'exists') {
    out(JSON.stringify({ status: 'exists', path: csvPath }));
    return 1;
  }
  out(JSON.stringify({ status: 'written', path: csvPath, replaced: result.replaced }));
  return 0;
}

const expandHome = (dir, home) => (dir === '~' ? home : /^~[\\/]/.test(dir) ? path.join(home, dir.slice(2)) : dir);

function rootsVerb([action, dir], { home, configDir, out, err }) {
  const config = loadConfig(configDir);
  const roots = config.roots;
  const save = (next) => {
    saveConfig(configDir, { ...config, roots: next });
    out(JSON.stringify(next));
    return 0;
  };
  if (action === undefined) {
    out(JSON.stringify(roots));
    return 0;
  }
  if ((action !== 'add' && action !== 'remove') || !dir) {
    err(USAGE);
    return 1;
  }
  const abs = path.resolve(expandHome(dir, home));
  if (action === 'add') {
    let isFolder = false;
    try {
      isFolder = fs.statSync(abs).isDirectory();
    } catch {
      // missing: reported below
    }
    if (!isFolder) {
      err(`timesheet: ${abs} is not a folder`);
      return 1;
    }
    return save(roots.includes(abs) ? roots : [...roots, abs]);
  }
  if (!roots.includes(abs)) {
    err(`timesheet: ${abs} is not a timesheet root`);
    return 1;
  }
  return save(roots.filter((r) => r !== abs));
}

async function readAll() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export async function timesheetCommand(args, deps = {}) {
  const home = deps.home ?? os.homedir();
  const {
    claudeDir = sessionsDir({ home }),
    configDir = defaultConfigDir(),
    csvPath,
    readStdin = readAll,
    out = console.log,
    err = console.error,
  } = deps;
  let parsed;
  try {
    parsed = parseArgs({ args, allowPositionals: true, options: OPTIONS });
  } catch {
    err(USAGE);
    return 1;
  }
  const { values, positionals: [verb, ...rest] } = parsed;
  if (verb === 'write') {
    const target = csvPath ?? path.join(timesheetDir({ home }), 'timesheet.csv');
    return writeVerb(Boolean(values.replace), { csvPath: target, readStdin, out, err });
  }
  if (verb === 'roots') return rootsVerb(rest, { home, configDir, out, err });

  if (verb === 'projects' || verb === 'collect') {
    try {
      dayWindow(values.date ?? '');
    } catch (e) {
      err(`timesheet: ${e.message}`);
      return 1;
    }
    const roots = loadConfig(configDir).roots;
    const day = await gatherDay(values.date, { home, claudeDir, roots });
    out(JSON.stringify(verb === 'projects' ? projectsView(day) : collectView(values.date, day, values.project)));
    return 0;
  }

  err(USAGE);
  return 1;
}
