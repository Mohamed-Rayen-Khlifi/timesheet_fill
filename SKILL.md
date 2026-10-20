---
name: timesheet_fill
description: Write one workday's timesheet row (French title and description) from your git commits and Claude Code sessions, into timesheets\timesheet.csv on the Desktop (Windows) or ~/timesheets/timesheet.csv (macOS, Linux), then, if the user wants, log it in Odoo as a task with its timesheet hours, moved to done or left in progress.
---

Write one timesheet row for one workday of the user's work.

Every command below runs this skill's own CLI through Bash: `node '<skill-dir>/bin/timesheet.js' <verb>`, where `<skill-dir>` is the base directory of this skill shown above. Keep the single quotes around the path. Each command prints JSON; read it, but do not paste the raw JSON to the user. If `node` is not found, tell the user to install Node.js 20.17 or later, and stop.

The timesheet has rows for workdays only, Monday to Friday. Never write a row dated on a Saturday or a Sunday: weekend work goes into the row of the Friday before or the Monday after (step 2).

1. **Day.** Ask with the `AskUserQuestion` tool which day the timesheet is for. Offer the last two workdays up to today, with the real weekday and date filled in, for example "Today (2026-10-19)" and "Friday (2026-10-16)" on a Monday, or Other. Accept an answer such as `2026-10-17`, `17/10/2026` or "lundi dernier", and turn it into `YYYY-MM-DD`. If the day is in the future, say so and ask again.

2. **Weekend.** The row covers its workday, and sometimes the weekend next to it. Below, "the days" means the workday plus any weekend day added in this step. The row is always dated on the workday.
   - If the user picked a Saturday or a Sunday, ask with `AskUserQuestion` where that weekend's work goes: "Friday before (YYYY-MM-DD)" or "Monday after (YYYY-MM-DD)". The chosen day becomes the row's workday, and the Saturday and Sunday of that weekend join the days, except a day in the future.
   - If the user picked a Monday, check the Saturday and Sunday before it. If they picked a Friday, check the Saturday and Sunday after it, except a day in the future. Run `node '<skill-dir>/bin/timesheet.js' projects --date YYYY-MM-DD` for each of these weekend days. If any has projects, ask with `AskUserQuestion` whether to add that weekend's work to this row: "Add the weekend" or "Leave it out". Say in the question that leaving it out keeps the weekend for the row on the other side of it, and give that Friday's or Monday's date. On "Add the weekend", the weekend days that have projects join the days.

3. **Projects found.** Run `node '<skill-dir>/bin/timesheet.js' projects --date YYYY-MM-DD` for each of the days, and merge the projects that share a `path`, adding up their commit and prompt counts. Tell the user about any `warnings`. If no day has projects, say that no commits or Claude Code sessions were found for those days, offer to pick another day or to add a folder with `node '<skill-dir>/bin/timesheet.js' roots add <dir>`, and stop.

4. **Pick projects.** Always ask with one `AskUserQuestion` call, never with a numbered list in the chat. Sort the projects by commits, then by prompts, most first. The options are "All my work" first, then one option per project: the label is the project `name`, the description gives its `path` and its commit and prompt counts. A question holds at most 4 options, so split the options into up to 4 multiSelect questions of at most 4 options each, all in the same call, with headers such as "Projects 1/2" and "Projects 2/2". If two projects share a `name`, add the parent folder to the label. With more than 15 projects, the last option of the last question is "Other projects", and its description says to type their names with Other. The chosen projects are the ones picked across all the questions; "All my work" picks every project.

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

   If it prints `{"status":"exists",...}`, that day already has a row. Ask with `AskUserQuestion`: "Replace" or "Keep the existing row". On Replace, run the same command again with `node '<skill-dir>/bin/timesheet.js' write --replace`. On Keep, use the existing row's title and description in step 9.

   When it prints `{"status":"written",...}`, tell the user the file path and show the row that was written.

9. **Odoo.** After the CSV row is written or kept, ask with `AskUserQuestion` whether to add this day to Odoo: "Add to Odoo" or "Skip Odoo". On Skip, stop. Otherwise log it with the Odoo MCP tools (`odoo_user_context`, `odoo_search_read`, `odoo_fields_get`, `odoo_create`, `odoo_write`). Start from the title and description of the row saved in the CSV for that workday, exactly as written. If an Odoo tool fails with an authentication error, tell the user to sign in through /mcp, and stop.
   1. **User.** Get the current user with `odoo_user_context`, and their employee with `odoo_search_read` on `hr.employee` where `user_id` is that user.
   2. **Project.** Search `project.project` for active projects. List the ones where the user is a member or follower, or has timesheets in the last 60 days, first. Ask with `AskUserQuestion` which project this work belongs to. With more than 4 projects, show a numbered list and ask for a number, or a name to search with `odoo_name_search`.
   3. **Hours.** Ask with `AskUserQuestion` for the start and end time of that day: "8:30 to 17:30 (default)", or Other to type times such as `9:00-18:00`. The hours are the end minus the start, as a decimal (8:30 to 17:30 is 9.0). If the end is not after the start, ask again.
   4. **Done.** Ask with `AskUserQuestion` whether the task should be moved to done: "Move to done" or "Leave in progress".
   5. **Review.** Show exactly what will be written: the project, the task name (the title), the task description, the assignee (the user), the date, the start and end time, the hours, and whether the task will be moved to done or left in progress. Ask with `AskUserQuestion`: "Write to Odoo" or "Skip Odoo", where the user can pick Other to change the title, the description, the date, the times, the project or the done choice. After a change, show the review again and ask again. A changed date must be a workday, not in the future. These changes apply to Odoo only: the CSV row stays as written. On Skip, stop. Never write to Odoo before "Write to Odoo".
   6. **Task.** Create a `project.task` with `name` set to the title, `description` set to the description and `project_id` set to the project, without an assignee. Then assign the user with `odoo_write` on the new task: `user_ids` set to `[[6,0,[uid]]]`, or `user_id` if `user_ids` does not exist (check with `odoo_fields_get`). If that write fails, for example with `Public user (id=3) doesn't have 'read' access to: User (res.users)`, do not create the task again: go on with the next steps: step 9 opens the task in the browser so that the user can assign themselves.
   7. **Timesheet.** Create an `account.analytic.line` with `date` set to the date, `name` set to the title, `project_id`, `task_id` set to the new task, `employee_id`, and `unit_amount` set to the hours. If the model has start and end time fields (check with `odoo_fields_get`), set them too. Odoo stores datetimes in UTC: convert the user's local start and end times to UTC with the `tz` from `odoo_user_context` before writing them, as `YYYY-MM-DD HH:MM:SS` (with `Africa/Lagos`, 8:30 to 17:30 is written `07:30:00` to `16:30:00`).
   8. **Move to done.** Only if the user chose "Move to done". If `project.task` has a `state` field with the value `1_done`, write `state` = `1_done`. Also write `stage_id` = the project's stage whose `fold` or `is_closed` is true, or whose name is "Done", "Terminé" or "Fait", if the project has one. On "Leave in progress", change neither.
   9. **Report.** Tell the user the task id and name, the project, the date, the hours logged, the assignee, and the final state and stage. Always end with the direct link to the task, even when a step failed: the Odoo base URL (the host of the Odoo MCP server, such as `https://odoo.hydatis.fr`; ask the user if it is not known) followed by `/web#id=<task id>&model=project.task&view_type=form`. If the task has no assignee, open it in the user's browser with `node '<skill-dir>/bin/timesheet.js' open '<task link>'`, keeping the single quotes around the link, and tell the user to add themselves in the **Assignees** field and save. If it prints `{"status":"failed",...}`, tell the user to open the link themselves. If a step failed after the task was created, say which step failed and that the task exists, with its id.

Extra folders to search for git repos, besides the home folder: `node '<skill-dir>/bin/timesheet.js' roots` lists them, `node '<skill-dir>/bin/timesheet.js' roots add <dir>` and `node '<skill-dir>/bin/timesheet.js' roots remove <dir>` change them.
