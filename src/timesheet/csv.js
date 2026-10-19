import fs from 'node:fs';
import path from 'node:path';

export const HEADER = ['date', 'projects', 'title', 'description'];

// RFC 4180 records; accepts LF or CRLF and a leading BOM.
export function parseCsv(text) {
  const src = text.startsWith('﻿') ? text.slice(1) : text;
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

const quote = (field) => (/[",\r\n]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field);

export function formatCsv(records) {
  return records.map((record) => record.map(quote).join(',') + '\r\n').join('');
}

const toRow = ([date, projects, title, description]) => ({ date, projects, title, description });
const toRecord = (row) => HEADER.map((key) => row[key]);

export function readRows(csvPath) {
  let bytes;
  try {
    bytes = fs.readFileSync(csvPath);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  // A spreadsheet app may save in a legacy encoding; decoding it as UTF-8 would destroy accents on rewrite.
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${csvPath} is not UTF-8; not changed`);
  }
  const [header, ...records] = parseCsv(text);
  if (!header) return [];
  if (header.join(',') !== HEADER.join(',')) throw new Error(`${csvPath} has unexpected columns; not changed`);
  return records.map(toRow);
}

// Appends the row, or puts it in place of that date's rows when replace is set.
export function writeRow(csvPath, row, { replace = false } = {}) {
  const rows = readRows(csvPath);
  const exists = rows.some((r) => r.date === row.date);
  if (exists && !replace) return { status: 'exists', replaced: false };
  let next;
  if (exists) {
    const first = rows.findIndex((r) => r.date === row.date);
    next = rows.flatMap((r, i) => (i === first ? [row] : r.date === row.date ? [] : [r]));
  } else {
    next = [...rows, row];
  }
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  const tmpFile = `${csvPath}.tmp`;
  fs.writeFileSync(tmpFile, formatCsv([HEADER, ...next.map(toRecord)]));
  fs.renameSync(tmpFile, csvPath);
  return { status: 'written', replaced: exists };
}
