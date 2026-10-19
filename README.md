# timesheet_fill

A Claude Code skill that writes one workday's timesheet row, with a French title and description, from your git commits and Claude Code sessions. Rows go to `~/timesheets/timesheet.csv`.

It is a standalone copy of Pegasus's `/pegasus_timesheet` skill: it carries its own CLI and does not need Pegasus.

## Requirements

- Node.js 20.17 or later
- git, with `user.email` set in each repo you commit from (commits are matched by that address)

No npm packages are needed.

## Install

Clone the repo into your personal skills folder:

```
git clone https://gitlab.waycon-stamp.com/MohamedRayen.Khlifi/timesheet_fill.git ~/.claude/skills/timesheet_fill
```

Start a new Claude Code session, then run `/timesheet_fill`.

## How it works

The skill asks for the day, finds the projects you worked on, lets you pick them, drafts the row in French, shows you a preview and writes it only after you confirm.

The timesheet has rows for workdays only. If you pick a Saturday or a Sunday, the skill asks whether that weekend's work goes into the Friday before or the Monday after. If you pick a Monday or a Friday and the weekend next to it has work, it asks whether to add it to that row.

The CLI behind it, `bin/timesheet.js`, has four verbs, each printing JSON:

| Verb | What it does |
|---|---|
| `projects --date YYYY-MM-DD` | Lists the day's projects with commit and prompt counts |
| `collect --date YYYY-MM-DD [--project <path>]...` | Returns the day's commits and prompts, per project |
| `write [--replace]` | Reads a row as JSON on stdin and adds it to the CSV |
| `roots [add <dir> \| remove <dir>]` | Lists or changes extra folders to search for git repos |

Extra folders are stored in `~/.config/timesheet_fill/config.json` (`%APPDATA%\timesheet_fill` on Windows).

## Tests

```
npm test
```
