# CLAUDE.md — FamilyFinance PRO

## Purpose

Permanent operating rules for Claude Code in the FamilyFinance PRO repository.

Current project state must come from the repository itself, especially:
- CURRENT_STATUS.md
- PROJECT_CONTEXT.md
- TODO.md
- CHANGELOG.md

Do not hardcode transient branch names, commit hashes, deployment IDs, or release-state assumptions here unless they are truly permanent rules.

## 1. Professional Judgment

- Do not agree with the user automatically.
- Challenge weak assumptions, contradictions, risky decisions, and unsupported conclusions.
- Prefer correctness, evidence, data safety, maintainability, and professional engineering judgment.
- Distinguish clearly between VERIFIED, INFERRED, and UNKNOWN.
- Never claim something was tested, fixed, deployed, released, verified, or safe without evidence.
- If the proposed approach is inferior or unnecessarily risky, say so and recommend the better approach.

## 2. Standard Workflow

For meaningful work:

UNDERSTAND → DEFINE → DESIGN → PLAN → EXECUTE → VERIFY → REVIEW → DOCUMENT → NEXT

For significant product or UX decisions:

TRUTH → BLUEPRINT → GAPS → RANK → PUSHBACK

Do not jump into implementation before the problem, scope, dependencies, expected behavior, risks, and success criteria are understood.

## 3. Session Opening Protocol

At the start of a new Claude Code session:

1. Read:
   - CURRENT_STATUS.md
   - PROJECT_CONTEXT.md
   - TODO.md
   - CHANGELOG.md
   - this CLAUDE.md
2. Inspect:
   - current branch
   - HEAD
   - origin synchronization / ahead-behind
   - git status
   - staged / unstaged / untracked files
   - last 5 commits
   - git tag --list
3. Compare docs ↔ code ↔ Git.
4. Report discrepancies.
5. Do not modify anything until the requested task is clear.

Never choose the next action from memory when a newer repository checkpoint exists.

## 4. Scope Discipline

- Make surgical, minimal, reversible changes.
- Do not perform unrelated refactors, cleanup, dependency upgrades, formatting sweeps, or rewrites.
- Do not modify unrelated dirty or untracked files.
- Do not stage, commit, clean, revert, or delete unrelated files.
- Scratch files should be created outside the repository whenever practical.
- A scratch file created inside the repository may be deleted only if you can prove you created that exact file during the current task.
- Report out-of-scope issues; do not fix them automatically unless they directly block the approved task.
- Prefer reuse of existing functions, structures, persistence keys, UI patterns, and helpers.
- Do not rewrite index.html or restructure the application when a focused change is sufficient.

Unexpected Git state = STOP.

## 5. Git / Release Approval Gates

Explicit user approval is required before:
- commit
- push
- merge
- rebase that changes shared history
- force push
- release tag
- rollback tag
- manual deployment
- merge/push to main
- Production release
- destructive cleanup/reset
- irreversible action

Routine local analysis, safe reads, targeted tests, and approved implementation inside the agreed scope do not require repeated approval.

Before any approved Git mutation, re-verify:
- branch
- HEAD
- origin state
- working tree
- exact staged scope
- unrelated files
- expected target commit/tag

Never use force operations unless explicitly authorized and justified.

## 6. Failure Protocol

When something unexpected fails:

STOP → OBSERVE → VERIFY → DIAGNOSE → REPLAN

- Do not retry blindly.
- Record the exact failure.
- Determine whether it is new or pre-existing.
- Reproduce safely when useful.
- Identify root cause before editing.
- Apply the smallest justified fix.
- Run focused regression afterward.
- Do not expand scope without approval when the expansion is material.

A pre-existing issue is not automatically a blocker for the current task.

## 7. Verification Standard

A syntax check or static read is not runtime proof.

Use the level of verification appropriate to the risk:
- static/source inspection
- pure-function/unit-style checks
- local HTTP runtime
- real Edge browser via CDP
- Desktop viewport
- Mobile viewport
- Vercel Preview
- Production verification

For meaningful UI/navigation changes:
- use a real browser
- verify Desktop and Mobile
- check console errors and warnings
- verify actual interaction, not only DOM presence

Do not describe static evidence as runtime verification.

## 8. FamilyFinance Data Model Safety

FamilyFinance PRO is currently a client-side application whose user data is stored locally in browser storage.

Treat persistence and financial calculations as high-risk areas.

Before changing data behavior:
- identify all affected stored fields and keys
- identify legacy fallbacks
- verify backward compatibility
- avoid destructive migration when a lazy/read-only fallback is sufficient
- never silently discard existing user data

Known family_finance_* storage is compatibility-sensitive.
Do not rename, remove, or repurpose keys without an explicit migration design and approval.

Import/restore must validate before overwriting data.
Backup/export changes require round-trip verification.
Reset/destructive data actions require clear confirmation.

## 9. Financial Calculation Rules

For cash-flow, loans, dates, recurring obligations, and balance calculations:
- test with known expected outputs
- test date boundaries
- test short months
- test February and leap years where relevant
- test month/year transitions
- test same-day events
- test future-start and end-boundary behavior
- prevent double counting
- preserve stored billing day even when the real calendar date must be clamped
- keep cumulative balance deterministic and explainable

Do not change a stored day such as 29/30/31 merely because a particular month is shorter.

## 10. Version 1.3 Cash-Flow Model — Permanent Product Decisions

Unless explicitly superseded:

### Unified cash-flow engine
- Forward-looking Insights should derive from the unified cash-flow event model rather than duplicate financial calculations in UI code.
- Reuse the established date-resolution/clamping helpers.

### Fixed obligations
- Fixed bank obligations are included.
- Fixed credit-card obligations are included.
- Annual fixed amounts are converted to monthly equivalents where the current model requires it.

### Loans
- Loans use effective billing day resolution.
- Loans only contribute within their active billing range.
- Future loans must not be counted before they start.

### Variable / installment-tracking items
- variable / "תשלומים שונים" remains tracking-only for forward cash flow.
- It must not be added to the forward cash-flow event stream unless the product/data model is deliberately redesigned, because doing so can double-count charges already represented elsewhere.

### One-time dated items
- Dated items remain one-time events.
- Do not introduce automatic lifecycle/archive behavior without a separate product decision.

### Forecast
- Current approved forward forecast horizon is six months.
- If there is no future income, "amount before next income" is unknown/null — not zero.
- Negative projected balance is a warning, not a blocking state.

## 11. Balance Anchor — Permanent Product Contract

Persistent fields are stored inside the existing settings object:
- anchorBalance
- anchorDate

Rules:
- anchorBalance may validly be 0.
- unset and zero are distinct.
- the anchor means: actual balance on anchorDate.
- estimated today balance = anchor balance + eligible cash-flow events strictly after anchor date through today.
- events on the anchor date are not applied again.
- forward projection starts from estimated today and applies events from tomorrow onward.
- catch-up (anchorDate, today] and future > today must remain disjoint.
- reconciliation ("עדכן יתרה בפועל") establishes a new anchor using the entered actual balance and today's local calendar date.

Legacy currentBalance:
- is read-only fallback behavior only.
- do not invent a historical date for it.
- do not perform an aggressive migration solely to replace it.

Do not create a second independent balance/forecast calculation in the UI.

## 12. Home vs Insights — Product Meaning

### Home
The Home hero/snapshot is the existing monthly "available to spend this month" concept.

### Insights
Insights is the authoritative forward-looking cash-flow view based on the Balance Anchor and unified event engine.

It is valid for Home and Insights to show different values because they represent different concepts.

The Home "next event" may use the unified engine, but there must not be a second contradictory authoritative forward forecast on Home.

## 13. UI / UX Rules

FamilyFinance PRO is Hebrew-first and RTL.

Preserve:
- RTL correctness
- current visual language
- clear hierarchy
- responsive Desktop + Mobile behavior
- predictable navigation
- clear back behavior on settings sub-screens
- understandable empty/error states

For significant new screens or visual/navigation changes:

DESIGN → USER APPROVAL → IMPLEMENTATION → VISUAL VERIFICATION → PREVIEW → PRODUCTION

Do not implement a material UX direction before it is approved.

## 14. Settings / Privacy

- The PIN is a privacy lock, not cryptographic encryption.
- Never describe it as full data encryption.
- Never print PINs, tokens, credentials, secrets, or secret-derived debugging values unnecessarily.
- Do not introduce secrets into client-side storage.
- PIN/auto-lock changes require verification of relevant set/change/remove/reset/reload/timeout flows.

## 15. Vercel / Preview / Production

Production safety takes precedence over speed.

- Feature branches may produce Vercel Preview deployments.
- Production is controlled through the Production branch/release flow.
- Never assume Preview and Production share browser localStorage; different origins do not share it.
- Verify the exact URL/origin used for persistence tests.
- Do not manually deploy when Git integration is expected to deploy automatically unless manual deployment is explicitly approved.
- Before Production release, define rollback and postconditions.
- After Production release, verify the stable Production URL in a real browser.

Current release state belongs in CURRENT_STATUS.md, not in this permanent rules file.

## 16. Documentation

When project state materially changes, update only the appropriate existing project documents:
- CURRENT_STATUS.md
- CHANGELOG.md
- PROJECT_CONTEXT.md
- TODO.md

Do not create duplicate status documents without a clear need.

Historical CHANGELOG entries should normally remain historical; correct current state through new entries rather than silently rewriting history.

Only meaningful product/operational tags should be documented as release/baseline/rollback anchors.

## 17. Context Management

Use /compact at major phase transitions, before a substantial new workstream, or when the Claude Code context has become large.

Do not use /compact:
- in the middle of an active failure investigation
- in the middle of verification
- for a tiny edit, quick review, or routine commit

Preferred sequence:

finish work → report → review → checkpoint → /compact → re-anchor → next

## 18. Parallel Work

Parallelize independent analysis and verification when it is safe and reduces time/token usage.

Good candidates:
- Git audit
- docs consistency audit
- read-only code mapping
- independent browser/runtime verification

Do not parallelize operations that can race on the same files/state or weaken containment.

Parallel agents must obey the same rules:
- no unrelated cleanup
- no deletion of untracked files
- no Git mutation without approval
- no claim of PASS without evidence

## 19. Reporting

Keep reports concise and evidence-based.

For significant stages, report:
- stage
- files changed
- tests/verification executed
- result
- diff stat
- Git state
- Preview/Production state when relevant
- blockers/risks
- decisions needed
- exact next step

When practical, put progress/status/verification intended for copy-paste into one code block.

## 20. Completion Criteria

A task is complete only when:
1. the approved scope is implemented,
2. relevant verification passed,
3. no unexpected Git changes remain,
4. documentation is updated when needed,
5. the exact next step is clear,
6. any required approval gate has been respected.

Priority order:

TRUTH → CORRECTNESS → DATA SAFETY → CONTINUITY → UX QUALITY → SPEED → TOKEN EFFICIENCY
