#!/usr/bin/env node
import { timesheetCommand } from '../src/timesheet-cmd.js';

process.exitCode = await timesheetCommand(process.argv.slice(2));
