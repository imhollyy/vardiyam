---
name: vardiyam-test-gate
description: Use to select the smallest meaningful typecheck, lint, unit, integration, or device verification for a change.
---

# Vardiyam Test Gate — v1.0

1. Map changed behavior to the narrowest relevant test command; inspect available scripts before running.
2. Run only checks affected by the change, plus required CI gates when preparing a merge/release.
3. Report exact command and actual result. Use `SKIP` with reason when the runner/test does not exist; never label an unrun check PASS.
4. Financial logic needs boundary/rounding regression fixtures; data migrations need migration and backup/restore round-trip; UI needs platform/device evidence when UI behavior is affected.
5. Do not use real salary data, secrets, `.env`, production systems, or live store accounts.
