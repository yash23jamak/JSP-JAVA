# ADLC knowledge pack for JAVA

This folder tells the **ADLC Support Platform** how to support JAVA: which business rules exist and where they live, which defects are known and how to fix them, which operational errors can be fixed automatically. It is versioned and reviewed with the code. When the code changes, update it in the same pull request.

You can write it **by hand** or with **any AI tool** your team uses (GitHub Copilot, Claude Code, Cursor, ChatGPT…). See [AI-INSTRUCTIONS.md](AI-INSTRUCTIONS.md). Either way, finish with:

```bash
node .adlc/check.mjs        # checks every entry against the current code; fix what it reports
```

## Folder layout

| Path | What | Who edits |
|---|---|---|
| `app.json` | Manifest: services, how to run tests, source folders, monitors | You |
| `knowledge/rules.json` | Business rules a business user may ask to change | You / AI tool |
| `knowledge/playbooks.json` | Known defects with an approved fix | You / AI tool / the platform (learned from fixes) |
| `knowledge/runbooks.json` | Approved operational fixes (restart, clear a queue) | Operations team |
| `knowledge/articles.json` | How-tos and known errors for support engineers | You / AI tool |
| `knowledge/scenarios.json` | Example tickets | You / AI tool |
| `knowledge/templates/` | Regression-test templates used by rules and playbooks | You / AI tool |
| `schema/` | JSON Schemas: your editor validates and autocompletes the files above | Platform (do not edit) |
| `examples/` | A complete, working example pack (another app) to copy from | Platform (do not edit) |
| `check.mjs` | The checker | Platform (do not edit) |

Each knowledge file is `{ "$schema": "../schema/<file>.schema.json", "entries": [ ... ] }` (a plain JSON array also works). Keep the `$schema` line: it gives you autocomplete and field descriptions in VS Code, JetBrains and other editors.

## Review rule: `"draft": true`
Any entry with `"draft": true` is **ignored** by the platform. Generated and AI-written entries must start as drafts. A person who knows the application reviews each one, corrects or deletes it, and removes `"draft"` from the ones that are right. `source` (where the entry came from) and `review` (a note for the reviewer) are free text.

## 1. Business rules (`rules.json`)
Use for values the business owns: limits, rates, windows, thresholds. For example "an invoice has at most 10 lines", or "SOWs ending within 90 days are highlighted".

```json
{
  "id": "BL-02",
  "label": "Maximum line items per invoice",
  "service": "Invoicing",
  "sources": [
    { "file": "docs/spec/billing.spec.md", "pattern": "at most \\*\\*(\\d+)\\*\\* line items" },
    { "file": "config/billing.config.json", "json": "maxLineItems" }
  ],
  "change": {
    "detect": {
      "when": "\\b(line items?|invoice lines?)\\b",
      "values": ["\\b(\\d{1,3})\\s*(?:line items?|lines)\\b"]
    },
    "slug": "max-lines-{{to}}",
    "title": "Maximum line items {{from}} → {{to}}",
    "commitScope": "config",
    "commitSubject": "allow up to {{to}} line items per invoice (BL-02)",
    "edits": [
      { "file": "config/billing.config.json", "pattern": "\"maxLineItems\": \\d+", "value": "\"maxLineItems\": {{to}}" },
      { "file": "docs/spec/billing.spec.md", "pattern": "at most \\*\\*\\d+\\*\\* line items", "value": "at most **{{to}}** line items" }
    ],
    "regressionTest": "templates/CR-BL-02.test.js.tmpl"
  }
}
```

How the fields work:
- **`sources`:** every place the current value lives. JSON files use `json` (a dotted path); other files use `pattern`, a regex with **one** capture group around the number. If the spec and the code disagree, the checker tells you.
- **`change.detect`:** a ticket is a change request when it contains:
  - a request verb (change, set, increase, allow…; override with `intent`)
  - the `when` words
  - a number found by `values` that differs from the current value
- **`change.edits`:** **every** file that must change. `pattern` is a regex; `value` replaces the match and can use `$1` and `{{to}}`.
- **The regression test:** asserts the new value `{{to}}`. Keep `Spec {{spec}}.` in its header comment, so a later change of the same rule replaces the old test.
- **Read-only rules:** leave out `change` for a rule that should only be read, for example to show the correct value in a playbook.

## 2. Known defects (`playbooks.json`)
Use when a defect is understood and its fix is exact. The platform writes the regression test, which must fail ("red"), applies the patches so the test passes ("green"), runs your test suite, then opens a pull request for review and merge.

```json
{
  "id": "FX-DISCOUNT",
  "slug": "percent-discount",
  "title": "Percentage discount subtracted as an amount",
  "service": "Invoicing",
  "spec": "BL-01",
  "risk": "standard",
  "classification": "bug-fix",
  "keywords": ["discount", "percent", "10%"],
  "symptoms": ["discount is wrong", "total too high after discount"],
  "probableCause": "applyDiscount() in src/invoice.js subtracts the percentage as an amount.",
  "commitScope": "invoice",
  "commitSubject": "apply percentage discounts as a percentage",
  "patches": [
    { "file": "src/invoice.js", "find": "return amount - percent;", "replace": "return amount * (1 - percent / 100);" }
  ],
  "regressionTest": "templates/FX-DISCOUNT.test.js.tmpl"
}
```

How the fields work:
- **`keywords` and `symptoms`:** the words **users** write. Matching uses the ticket title, its description, and the evidence an integrated app sends.
- **`patches`:** `find` must occur exactly once in the file, or use `pattern` (a regex) with `replace`.
  - The checker accepts a patch whose fix is already in the code. The defect may come back, and the platform then reports "already fixed" instead of changing anything.
- **`uses`:** add rule ids when the fix needs a rule's current value (`{{BL_02}}`).

## 3. Operational fixes (`runbooks.json`)
Only for errors fixed by an operational action that the operations team owns and approves:

```json
{
  "id": "RB-01", "title": "Restart the invoice worker", "owner": "Billing SRE", "approved": true, "risk": "low",
  "env": "prod", "command": "node ops/runbooks/rb-01.js {state} {action}", "monitor": "invoice-queue",
  "service": "Invoicing", "keywords": ["invoice queue", "invoice worker"], "symptoms": ["invoices not generated"]
}
```

The platform runs `command` in the deployed release with `{action}` set to `precheck`, then `execute`, then `postcheck`, and `revert` if the postcheck fails.
- The **last line** the command prints must be JSON: `{"ok": true, "message": "…"}`.
- `precheck` returns `ok: true` only when the known error is really present.
- The command gets `ADLC_ENV` and `ADLC_STATE_FILE`. It never gets the platform's credentials.

## 4. Articles (`articles.json`) and example tickets (`scenarios.json`)

```json
{ "id": "KB-0001", "title": "Invoice queue backlog: worker not running", "kind": "known-error", "service": "Invoicing", "runbook": "RB-01",
  "summary": "Invoices stay pending when the worker stops. RB-01 restarts it.", "doc": "docs/operations.md#invoice-worker", "updated": "2026-10-15" }
```
```json
{ "id": "discount-defect", "label": "Defect: 10% discount subtracted as 10", "expected": "Matches FX-DISCOUNT",
  "ticket": { "title": "Discount of 10% gives the wrong amount", "description": "10% of 200.00 gave 190.00, expected 180.00", "service": "Invoicing", "impact": "medium" } }
```

`kind` is one of `how-to`, `known-error`, `faq` or `procedure`. Write example tickets the way users write them. A change request needs a verb, for example "Please **change** the maximum invoice lines to 12".

## 5. Regression-test templates (`knowledge/templates/`)
A template is a normal test file of your test framework, saved as `<name>.<ext>.tmpl`. The platform writes it to the path set in `app.json` → `tests.regressionTest`, with the ticket id filled in.

Variables:

| Variable | Meaning |
|---|---|
| `{{ticketId}}` | The ticket id, e.g. `TKT-1042` (put it in the test name) |
| `{{title}}` | The ticket title |
| `{{spec}}` | The spec or rule id |
| `{{from}}`, `{{to}}` | Current and requested value (rule changes) |
| `{{BL_02}}` | Current value of a rule (rule id with `-` replaced by `_`) |

Filters: `{{to | plus1}}`, `minus1`, `minusCent`, `money`, `slug`, `upper`, `lower`.

Imports are relative to the **regression-test folder**, not to `templates/`. See `examples/knowledge/templates/`.

## 6. Checklist
- [ ] `app.json`: `domain`, `owner`, `services` and `tests` are right, and the test command passes on `main`.
- [ ] Every rule reads its value (`node .adlc/check.mjs` shows no ✗).
- [ ] Keywords and symptoms are in users' words.
- [ ] Drafts are reviewed: `"draft": true` is removed only from correct entries.
- [ ] Committed on the default branch. Then run **Sync repository** in the platform.
