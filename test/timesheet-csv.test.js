import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmp } from '../test-fixtures/tmp.js';
import { HEADER, parseCsv, formatCsv, readRows, writeRow } from '../src/timesheet/csv.js';

const row = (date, title = 't') => ({ date, projects: 'pegasus', title, description: 'd' });
const rec = (r) => [r.date, r.projects, r.title, r.description];

test('quoting round trip', () => {
  const recs = [HEADER, ['2026-10-18', 'pegasus; odoo', 'Titre, avec "guillemets"', 'Ligne 1\nLigne 2']];
  const text = formatCsv(recs);
  assert.equal(text, 'date,projects,title,description\r\n2026-10-18,pegasus; odoo,"Titre, avec ""guillemets""","Ligne 1\nLigne 2"\r\n');
  assert.deepEqual(parseCsv(text), recs);
  assert.deepEqual(parseCsv(text.replaceAll('\r\n', '\n')), recs);
});

test('append creates the folder and the header', () => {
  const p = path.join(tmp(), 'timesheets', 'timesheet.csv');
  assert.deepEqual(writeRow(p, row('2026-10-18')), { status: 'written', replaced: false });
  assert.equal(fs.readFileSync(p, 'utf8'), formatCsv([HEADER, rec(row('2026-10-18'))]));
});

test('exists leaves the file alone; replace takes the first place and drops duplicates', () => {
  const p = path.join(tmp(), 'timesheet.csv');
  const a = row('2026-10-17'), b = row('2026-10-18', 'b'), c = row('2026-10-18', 'c'), d = row('2026-10-19');
  fs.writeFileSync(p, formatCsv([HEADER, ...[a, b, c, d].map(rec)]));
  const before = fs.readFileSync(p, 'utf8');
  assert.deepEqual(writeRow(p, row('2026-10-18', 'new')), { status: 'exists', replaced: false });
  assert.equal(fs.readFileSync(p, 'utf8'), before);
  assert.deepEqual(writeRow(p, row('2026-10-18', 'new'), { replace: true }), { status: 'written', replaced: true });
  assert.deepEqual(readRows(p), [a, row('2026-10-18', 'new'), d]);
});

test('a file with other columns is never changed', () => {
  const p = path.join(tmp(), 'timesheet.csv');
  fs.writeFileSync(p, 'date,hours\r\n');
  assert.throws(() => writeRow(p, row('2026-10-18')), { message: `${p} has unexpected columns; not changed` });
  assert.equal(fs.readFileSync(p, 'utf8'), 'date,hours\r\n');
});

test('a file that is not UTF-8 is never changed', () => {
  const p = path.join(tmp(), 'timesheet.csv');
  const latin1 = Buffer.from('date,projects,title,description\r\n2026-10-17,pegasus,D\xe9veloppement,d\r\n', 'latin1');
  fs.writeFileSync(p, latin1);
  assert.throws(() => writeRow(p, row('2026-10-18')), { message: `${p} is not UTF-8; not changed` });
  assert.deepEqual(fs.readFileSync(p), latin1);
});

test('BOM, LF endings and an empty file are accepted', () => {
  const p = path.join(tmp(), 'timesheet.csv');
  fs.writeFileSync(p, '﻿date,projects,title,description\n2026-10-17,pegasus,t,d\n');
  assert.deepEqual(readRows(p), [row('2026-10-17')]);
  fs.writeFileSync(p, '');
  assert.deepEqual(writeRow(p, row('2026-10-18')), { status: 'written', replaced: false });
  assert.deepEqual(readRows(p), [row('2026-10-18')]);
});
