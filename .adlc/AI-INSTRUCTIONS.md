# Instructions for an AI coding assistant: fill the ADLC knowledge pack of JAVA

> **How to use:** open this repository in your AI tool and ask it to follow this file.
> - **GitHub Copilot Chat** (agent mode): `#file:.adlc/AI-INSTRUCTIONS.md Follow these instructions.`
> - **Claude Code:** `Follow .adlc/AI-INSTRUCTIONS.md`
> - **Cursor:** `@.adlc/AI-INSTRUCTIONS.md follow this`
> - **Other chat tools:** paste this file plus the files it asks for.
>
> To focus on one area, add for example "only for the Invoicing service" or "only business rules".

## Your task
Write knowledge-pack entries in `.adlc/knowledge/` that let the ADLC Support Platform recognise and handle this application's issues. The exact format, every field, and examples are in `.adlc/README.md`, the JSON Schemas in `.adlc/schema/`, and the complete example in `.adlc/examples/`. **Read those first, and follow them exactly.**

## Hard rules
1. **Only facts from this repository.** Every file path, value, function name and code fragment you write must exist in the code now. Never invent rules, values or fixes.
2. **Mark every entry you add as a draft:** `"draft": true`, plus `"source": "<tool name>: <what you based it on>"`. Add `"review": "<what the reviewer should confirm>"` when you are unsure. A person removes `"draft"` after reviewing.
3. **Never change or delete existing entries** unless the person asked you to. Ids must be unique across all knowledge files.
4. **Do not change application code** for this task. Only write files under `.adlc/`.
5. **JSON escaping:** in regex strings, a backslash is written `\\`. For example the regex `\d+` is `"\\d+"` in JSON.
6. **Finish by running `node .adlc/check.mjs --strict`** and fix every ✗ it reports in YOUR entries. If something cannot be made to pass, remove that entry and say why.

## What to look for, in this order
1. **`.adlc/app.json`:**
   - `domain`, `owner` (ask the person if they are unknown)
   - `services`: the areas users report problems about, in their words
   - `tests.command`, `tests.regressionTest` and `quality.sourceDirs`: check these against `package.json`, `pom.xml`, `*.csproj` or `pyproject.toml`, and the existing tests
2. **Business rules → `rules.json`.**
   - **Look for:** values the business owns and could ask to change: limits, thresholds, rates, durations, counts, windows, minimums and maximums. Typical places: config files, exported constants, settings tables, specs or requirements docs (`docs/`, `Supporting Material/`, BRDs).
   - **Skip:** technical settings (timeouts of libraries, pool sizes, ports, cache sizes, page sizes for APIs) unless a requirement document names them.
   - **For each rule:**
     - `sources`: every place the value lives (spec AND code)
     - `change.detect`: the words users would use
     - `change.edits`: every place to update
     - a regression-test template in this repository's test framework and style, which asserts the new value `{{to}}`. Base it on an existing test.
3. **Known defects → `playbooks.json`.**
   - **Where to look:** the git history (`git log --oneline` with fix/bug commits), the tests that reproduce bugs, and the docs.
   - **When a fix is exact and small:** write the playbook with the `patches` the fix applied (`find` = the buggy code, `replace` = the fixed code) and a regression-test template based on the test that proves it.
   - **`keywords` and `symptoms`:** write them in the words users and support staff use, not code names.
   - **If you cannot give exact patches:** write a known-error **article** instead of a playbook.
4. **Operational fixes → `runbooks.json`:** only when the repository already contains an operational script with the precheck/execute/postcheck/revert contract described in `.adlc/README.md`, and an owner is named. Otherwise list the candidates in your summary and write nothing.
5. **Articles → `articles.json`:** how-tos and known errors a support engineer needs, each with a 1-3 sentence `summary` and a `doc` link to where the full text lives.
6. **Example tickets → `scenarios.json`:** 3-8 realistic tickets in users' words that should match your rules and playbooks. Change requests need a verb such as change, set or increase.

## When you are done
Reply with a short summary:
- what you added, per file
- what the reviewer must check (uncertain values, assumptions)
- what you left out and why
- the result of `node .adlc/check.mjs --strict`
