---
name: timesheet_fill
description: Write one workday's timesheet row (French title and description) from your git commits and Claude Code sessions, into timesheets\timesheet.csv on the Desktop (Windows) or ~/timesheets/timesheet.csv (macOS, Linux).
---

Write one timesheet row for one workday of the user's work.

Every command below runs this skill's own CLI through Bash: `node '<skill-dir>/bin/timesheet.js' <verb>`, where `<skill-dir>` is the base directory of this skill shown above. Keep the single quotes around the path. Each command prints JSON; read it, but do not paste the raw JSON to the user. If `node` is not found, tell the user to install Node.js 20.17 or later, and stop.

The timesheet has rows for workdays only, Monday to Friday. Never write a row dated on a Saturday or a Sunday: weekend work goes into the row of the Friday before or the Monday after (step 2).

1. **Day.** Ask with the `AskUserQuestion` tool which day the timesheet is for. Offer the last two workdays up to today, with the real weekday and date filled in, for example "Today (2026-10-19)" and "Friday (2026-10-16)" on a Monday, or Other. Accept an answer such as `2026-10-17`, `17/10/2026` or "lundi dernier", and turn it into `YYYY-MM-DD`. If the day is in the future, say so and ask again.

2. **Weekend.** The row covers its workday, and sometimes the weekend next to it. Below, "the days" means the workday plus any weekend day added in this step. The row is always dated on the workday.
   - If the user picked a Saturday or a Sunday, ask with `AskUserQuestion` where that weekend's work goes: "Friday before (YYYY-MM-DD)" or "Monday after (YYYY-MM-DD)". The chosen day becomes the row's workday, and the Saturday and Sunday of that weekend join the days, except a day in the future.
   - If the user picked a Monday, check the Saturday and Sunday before it. If they picked a Friday, check the Saturday and Sunday after it, except a day in the future. Run `node '<skill-dir>/bin/timesheet.js' projects --date YYYY-MM-DD` for each of these weekend days. If any has projects, ask with `AskUserQuestion` whether to add that weekend's work to this row: "Add the weekend" or "Leave it out". Say in the question that leaving it out keeps the weekend for the row on the other side of it, and give that Friday's or Monday's date. On "Add the weekend", the weekend days that have projects join the days.

3. **Projects found.** Run `node '<skill-dir>/bin/timesheet.js' projects --date YYYY-MM-DD` for each of the days, and merge the projects that share a `path`, adding up their commit and prompt counts. Tell the user about any `warnings`. If no day has projects, say that no commits or Claude Code sessions were found for those days, offer to pick another day or to add a folder with `node '<skill-dir>/bin/timesheet.js' roots add <dir>`, and stop.

4. **Pick projects.** With 3 projects or fewer, ask with `AskUserQuestion` (multiSelect) using "All my work" plus one option per project: the label is the project `name`, the description gives its `path` and its commit and prompt counts. With more than 3 projects, show a numbered list (name, path, commits, prompts) and ask the user to answer with numbers such as `1,3` or with `all`.

5. **Collect.** Run the collect command once for each of the days. For "All my work", run `node '<skill-dir>/bin/timesheet.js' collect --date YYYY-MM-DD`. Otherwise run it with one `--project '<path>'` per chosen project, using the `path` values from step 3. Always put each path in single quotes, so spaces and Windows backslashes survive the shell. With several days, a `no activity on <date> in <path>` warning only means that project had no work that day: do not report it. If any output has `truncated` set to true, tell the user that some prompts or commit details were left out because the day was large.

6. **Write the text, in French.**
   - Title: at most 80 characters, starting with an action noun or verb, for example "Suppression de l'app Microsoft 365 de Pegasus et doc d'installation".
   - Description: 2 to 4 sentences about what was done and why, covering the work of all the days.
   - Base both mainly on the commits; use the prompts and session titles only as support.
   - Never describe work that is not in the data. Never copy prompt text, commit hashes, tokens, passwords or other secrets into the text.
   - Projects: the `name` of every project in the collected data, each one once.

7. **Preview.** Show the date (the workday), the weekend days included if there are any, the projects joined with `; `, the title and the description. Ask with `AskUserQuestion`: "Write" or "Cancel", where the user can pick Other to type changes. After a change, show the new preview and ask again. On Cancel, stop without writing.

8. **Write.** Run the write command with the row as JSON in a quoted heredoc, so that quotes and apostrophes in the French text are passed exactly. The `date` is the workday, never a Saturday or a Sunday. The JSON must be valid: write a double quote inside the text as `\"`.

   ```
   node '<skill-dir>/bin/timesheet.js' write <<'EOF'
   {"date":"2026-10-16","projects":["pegasus"],"title":"…","description":"…"}
   EOF
   ```

   If it prints `{"status":"exists",...}`, that day already has a row. Ask with `AskUserQuestion`: "Replace" or "Keep the existing row". On Replace, run the same command again with `node '<skill-dir>/bin/timesheet.js' write --replace`. On Keep, stop.

   When it prints `{"status":"written",...}`, tell the user the file path and show the row that was written.

Extra folders to search for git repos, besides the home folder: `node '<skill-dir>/bin/timesheet.js' roots` lists them, `node '<skill-dir>/bin/timesheet.js' roots add <dir>` and `node '<skill-dir>/bin/timesheet.js' roots remove <dir>` change them.
