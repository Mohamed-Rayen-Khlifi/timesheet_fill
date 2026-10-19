import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('timesheet_fill skill is well-formed', () => {
  const skill = fs.readFileSync(path.join(root, 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: timesheet_fill\n/);
  for (const s of ["node '<skill-dir>/bin/timesheet.js' projects --date", "node '<skill-dir>/bin/timesheet.js' collect --date",
    "node '<skill-dir>/bin/timesheet.js' write", "<<'EOF'", '--replace', 'AskUserQuestion', "--project '<path>'", '`truncated`',
    'Saturday or a Sunday', 'Friday before', 'Monday after'])
    assert.ok(skill.includes(s), s);
  assert.ok(!skill.includes('pegasus timesheet'), 'skill must not call the Pegasus CLI');
});

test('the CLI the skill calls exists', () => {
  assert.ok(fs.existsSync(path.join(root, 'bin', 'timesheet.js')));
});
