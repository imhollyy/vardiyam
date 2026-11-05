# VDY-010B — Design system, onboarding, calendar and reports

## Scope and decisions

- Built from VDY-010A commit `176bc29` in branch `feat/vdy-010b-design-onboarding`; no merge/release.
- Kept existing shift, WorkRecord, earnings, payments, and backup repositories/motors. No schema migration or SQL in screen components.
- Onboarding progress, report-preview access, and theme remain local `app_metadata` preferences through the transaction queue. Existing installations with shift, earnings, work, payment, or approved snapshot data bypass first-run onboarding.
- The four-step setup reuses current shift and earnings setup screens. Wage entry remains optional; skipping stores only onboarding completion and does not modify saved shift/workplace data.
- Reports use recorded WorkRecords/statuses/plans, the latest matching line from explicitly approved earnings snapshots, and selected payroll-period payment ledger data. Gross, payslip net, and allocated net payment remain separately labelled. Plan duration difference is informational and does not classify legal overtime.
- Rewarded reports unlock is a local development preview only. It displays that no ad is played, uses a 24-hour expiry and one-use-per-Istanbul-day state, and does not claim an ad SDK or Pro entitlement is connected.
- Expo SDK 58 `@expo/vector-icons` (Ionicons) is used consistently. The requested Tam Kare package could not be identified in available local or connected repository sources; no direct package equivalence is claimed.

## Evidence

- `npm ci`: PASS; repository audit remains at 12 moderate findings (R13, unchanged).
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm test`: 269/269 PASS; includes day/week/month boundary splits for overnight work and separately disclosed break minutes without a recorded time.
- `npx expo-doctor --verbose`: local dependency/peer checks pass after installing Expo-compatible `expo-font`; two remote metadata checks FAIL with DNS/network errors (`exp.host` and React Native Directory).
- Android JS export: PASS; iOS JS export: PASS. These are bundle checks, not app launch or device acceptance.
- iOS simulator/physical-device open, time picker interaction, Dynamic Type XL, TalkBack/VoiceOver and visual screenshot loop: NOT RUN (Windows environment has no iOS runtime; no device was attached).
- GitHub Actions run `42120510298`: PASS on PR #30 head `1f431410309e7350c9c3ee94dae4c2babcce8c90` (`Verify Expo scaffold`).

## Remaining review and risks

- Independent UI/accessibility review: APPROVE after fixing one P2. Night records now split by local date, timed breaks follow their actual local-date segments, and unknown break time is disclosed instead of assigned to a date. Targeted report tests by reviewer: 5/5 PASS; no P0/P1/P2 findings remain. Device visual verification NOT RUN.
- Reward flow is a disclosed UI/state preview; production rewarded ads and Pro purchase entitlement are not integrated.
- R08, R13, Ethernet profile policy, and Turkish labor-law expert review remain separate open risks.
