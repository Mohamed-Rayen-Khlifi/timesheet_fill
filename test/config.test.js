import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timesheetDir, windowsDesktop } from '../src/config.js';

const env = { USERPROFILE: 'C:\\Users\\me' };
const reg = (value) => () => ({ status: 0, stdout: `\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders\r\n    Desktop    REG_EXPAND_SZ    ${value}\r\n\r\n` });
const always = () => true;

test('timesheets go in the home folder outside Windows', () => {
  assert.equal(timesheetDir({ platform: 'linux', home: '/home/me' }), '/home/me/timesheets');
  assert.equal(timesheetDir({ platform: 'darwin', home: '/Users/me' }), '/Users/me/timesheets');
});

test('timesheets go on the Windows Desktop the registry names, OneDrive included', () => {
  const run = reg('%USERPROFILE%\\OneDrive - Hydatis\\Desktop');
  assert.equal(timesheetDir({ platform: 'win32', env, home: 'C:\\Users\\me', run, exists: always }),
    'C:\\Users\\me\\OneDrive - Hydatis\\Desktop\\timesheets');
});

test('Windows variable names ignore case', () => {
  assert.equal(windowsDesktop({ env, home: 'C:\\Users\\me', run: reg('%userprofile%\\Bureau'), exists: always }), 'C:\\Users\\me\\Bureau');
});

test('the Windows Desktop falls back to %USERPROFILE%\\Desktop', () => {
  const home = 'C:\\Users\\me';
  assert.equal(windowsDesktop({ env, home, run: () => ({ status: 1, stdout: '' }), exists: always }), 'C:\\Users\\me\\Desktop');
  assert.equal(windowsDesktop({ env, home, run: () => ({ status: null, error: new Error('ENOENT') }), exists: always }), 'C:\\Users\\me\\Desktop');
  assert.equal(windowsDesktop({ env: {}, home, run: reg('%USERPROFILE%\\Desktop'), exists: always }), 'C:\\Users\\me\\Desktop');
  assert.equal(windowsDesktop({ env, home, run: reg('D:\\Gone\\Desktop'), exists: () => false }), 'C:\\Users\\me\\Desktop');
});
