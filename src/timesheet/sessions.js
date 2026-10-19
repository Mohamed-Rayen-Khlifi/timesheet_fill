import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const MAX_TEXT = 300;
const WRAPPERS = ['<command-', '<local-command-', 'Caveat:'];

export function sessionsDir({ env = process.env, home = os.homedir() } = {}) {
  return env.CLAUDE_CONFIG_DIR ? path.join(env.CLAUDE_CONFIG_DIR, 'projects') : path.join(home, '.claude', 'projects');
}

function sessionFiles(dir, start) {
  const files = [];
  for (const project of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    const projectDir = path.join(dir, project.name);
    let entries;
    try {
      entries = fs.readdirSync(projectDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
      const file = path.join(projectDir, entry.name);
      if (fs.statSync(file).mtime >= start) files.push(file);
    }
  }
  return files;
}

// A prompt the user typed: not a tool result, a meta record, a subagent turn or a slash-command wrapper.
function isPrompt(r) {
  return r.type === 'user' && r.isSidechain !== true && r.isMeta !== true &&
    typeof r.message?.content === 'string' && !WRAPPERS.some((w) => r.message.content.startsWith(w));
}

export async function readSessions(dir, { start, end }) {
  if (!fs.existsSync(dir)) return { found: false, prompts: [], titles: {} };
  const prompts = [];
  const allTitles = {};
  for (const file of sessionFiles(dir, start)) {
    const lines = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
    for await (const line of lines) {
      let r;
      try {
        r = JSON.parse(line);
      } catch {
        continue;
      }
      if (r?.type === 'ai-title' && r.sessionId) {
        allTitles[r.sessionId] = r.aiTitle;
      } else if (r && isPrompt(r)) {
        const time = new Date(r.timestamp);
        if (time >= start && time < end) {
          prompts.push({ time: r.timestamp, cwd: r.cwd, sessionId: r.sessionId, text: r.message.content.slice(0, MAX_TEXT) });
        }
      }
    }
  }
  prompts.sort((a, b) => new Date(a.time) - new Date(b.time));
  const titles = {};
  for (const { sessionId } of prompts) if (sessionId in allTitles) titles[sessionId] = allTitles[sessionId];
  return { found: true, prompts, titles };
}
