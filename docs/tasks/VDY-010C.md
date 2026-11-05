# VDY-010C — Product UX polish

## Scope

Continue from PR #30 head `fe93e27ba8695ab6a414c79839326e92afd17e37` on `feat/vdy-010c-product-ux-polish`. Preserve the accepted visual direction and existing shift, work, earnings, payment, backup, and recovery rules. Do not merge, release, rebase, force-push, or change the constitution or migrations.

The parent VDY-010B worktree contains unstaged user changes in `.gitignore` and `expo-env.d.ts`; this task uses a separate clean worktree so neither file is staged or modified.

## Initial product / UX audit

Routes: Today, Calendar, Earnings, Reports, Settings, onboarding, WorkRecords, EarningsSettings, NetPayments, Backup. All routes use the local SQLite source of truth; themes are manually selected and persisted. Existing native time selection is used on Today and WorkRecords.

| Priority | Finding | Planned treatment |
|---|---|---|
| P1 — CLOSED | Today re-enabled clock-in after an earlier same-local-day session was completed. | Primary action now checks completed records in the current configured timezone, disables repeat start, and links to explicit manual history entry. |
| P2 | Onboarding has two consecutive steps that open the same earnings settings screen, and the final step lacks an actual schedule summary/first-week preview. | Reduce redundant navigation, persist each checkpoint, and show a summary from saved schedule data. |
| P2 | Payment date is free-form `YYYY-AA-GG`; settings and payment flows expose large forms without grouping or native date selection. | Use platform date picker and organize the most-used actions before advanced details. |
| P2 | Calendar plan editor can close through the modal close/back gesture while edits are unsaved. | Add dirty-state confirmation and prevent accidental draft loss. |
| P2 | Reports currently lack a useful date-trend visualization for recorded hours and some categories are easy to confuse with inferred values. | Add compact, accessible period visualization using existing report data only; keep uncertain values explicit. |
| P2 | Theme preference loads after the initial light state, allowing a brief wrong-theme render. | Gate app content until the stored theme is resolved without overwriting user choice. |
| P3 | Reusable design coverage is limited mostly to PageHeading; button, card, state, and settings-row treatment varies by route. | Add a small shared token/component layer and migrate the highest-traffic surfaces without a wholesale rewrite. |

## Plan and boundaries

1. Inspect route forms, empty/loading/error states, theme, navigation, and current data flows; record the focused audit.
2. Add minimal design tokens/shared components and improve initial theme readiness.
3. Fix high-impact interactions: onboarding navigation/summary, duplicate clock-in, native payment date, and unsaved calendar edit guard.
4. Improve Reports and group settings/payments/backup information using existing repository data only.
5. Add focused automated regressions, run typecheck/lint/tests/Expo exports/Expo Doctor/diff checks, obtain independent R2 UI/accessibility review, and prepare a stacked draft PR against PR #30.

## Verification limits

Do not claim actual iPhone/Android visual or accessibility acceptance unless performed on device. No real personal data, live backup restore, destructive data wipe, financial rule changes, or migration changes are in scope.

## Implementation checkpoint — 2026-11-06

- Shared theme readiness now gates routed content behind the Expo splash until the saved manual theme preference is read; default remains light. Reusable spacing/radius/control/type tokens, common page heading, settings action button, and a timezone-aware native date/time picker are used in high-traffic flows.
- Work record start/end and timed-break date/time values, shift-cycle anchor date and template times, and real payment date now use the native picker. Payment date remains an explicit local date and does not assign a payroll period.
- Today disables its primary start action after a completed record on the same configured local date and links to history for an explicitly manual additional record. Calendar plan editor now confirms before discarding a changed draft.
- Onboarding avoids the two repeated settings steps, makes pay/workplace configuration optional, persists the summary checkpoint, and shows a saved-cycle summary before completing. Reports adds a compact daily/weekly/monthly actual-work trend using the existing segmentation engine; unknown aggregate break allocation remains visually “Belirsiz”.
- Focused regressions cover completed-day clock-in, calendar draft changes, trend splits/mixed known-unknown periods, and DST-gap picker normalization. Full suite PASS: 276/276; typecheck and lint PASS; Android and iOS JS exports PASS (Hermes bytecode emitted); Expo Doctor PASS (20/20); diff check PASS.
- Independent R2 UI/accessibility review **APPROVE**, no remaining static P0/P1/P2. The reviewer’s startup splash, primary contrast, report uncertainty, and DST draft findings were fixed and re-reviewed. No native device screenshot, VoiceOver/TalkBack, large-text or small-screen user acceptance has been performed. No database migrations or shift/earnings/payment/backup rules were changed.
- GitHub CI pending stacked draft PR creation. No merge/release.
