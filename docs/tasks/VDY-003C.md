# VDY-003C — Gerçek Vardiya Takvimi ve Bugün Ekranı

**Durum:** READY_FOR_REVIEW — R2, `feat/vdy-003c-shift-calendar-ui`; draft PR #11 open, no merge.
**Kaynak:** GitHub Issue #10. **Base:** VDY-003B `58b9091abacebbc1223e7c085d9ca3f8b96660c1`.

## Kabul kapsamı

- Vardiya şablonları (ad/kod/başlangıç-bitiş) ve düzen adı, IANA timezone, anchor tarihi ve başlangıç vardiyası için ayar akışı.
- Sabit, haftalık üç vardiya, 2+2+2, 4+2, 6+1 ve kullanıcı tanımlı çevrim; var olan `src/domain/shift-cycle` constructor/projection/validation fonksiyonları kullanılacak.
- Şablon + çevrimi tek SQLite repository işlemi/transaction'ında oluşturma veya düzenleme; aynı connection'ın işlem kuyruğundan geçiş.
- Ay bazlı canlı takvim: ay gezinme, gün seçimi, SHIFT/OFF/LEAVE etiketi/simgesi ve planlanan saatler.
- Tek güne özel SHIFT/OFF/LEAVE override oluşturma, düzenleme ve onaylı kaldırma; sonraki çevrim günleri değişmeden kalmalı.
- Bugün planı ve yaklaşan vardiyalar; veri yoksa yönlendirici empty state. WorkRecord, fiilî çalışma, ücret/mesai yok.
- Açık/koyu tema, loading/error/success, büyük yazı ve ekran okuyucu adları.

## Kapsam dışı / koruma

VDY-004 fiilî kayıtları, ücret, mesai, IAP, tam onboarding, backup/restore, iOS/cihaz smoke zorunluluğu, Windows network/SDK/ADB, merge/release. Existing user schedule is never bulk-created or silently overwritten. VDY-003B branch and PR #4/#6/#7/#9 remain unchanged.

## Plan

1. Existing route, repository, cycle engine, theme, and tests inspected; add atomic schedule save/update API and tests.
2. Add pure schedule-form builder using existing domain constructors; cover presets, anchor/start shift, and custom entries.
3. Build accessible Settings editor with safe preview and explicit save/edit behavior.
4. Build repository-backed month calendar and confirmed one-day override flow.
5. Build Today/upcoming read-only plan view; add error/loading/empty/success and theme states.
6. Run typecheck/lint/tests/Expo Doctor/CI, independent R2 review, update progress and draft PR; no merge.

## Evidence

### Implementation and verification — 2026-11-05

- Schedule editor saves templates/cycle atomically through `saveShiftSchedule`; available patterns are fixed, weekly three-shift, 2+2+2, 4+2, 6+1 and custom. IANA time zone, anchor date, starting shift, shift times and names are editable.
- Today, upcoming shifts, month calendar and selected-day SHIFT/OFF/LEAVE overrides use existing SQLite repository/domain projection. OFF remains a planned off day, not a legal rest determination.
- Automated tests cover schedule constructors, custom validation, date/month/leap boundaries, save rollback, SQLite persistence/reopen, overrides and exact saved `startIndex` phase preservation. Synthetic repository tests only; no diagnostic code added to production.
- `npm run typecheck` PASS; `npm run lint` PASS; `npm test` PASS (83/83); `npx expo-doctor --verbose` PASS (20/20); Android Expo bundle export PASS (1,190 modules); `git diff --check` PASS.
- UI touch target follow-up: schedule chips/removal buttons ≥44 dp; calendar day cells have 6 dp horizontal hit expansion. No VDY-003C device smoke was required or performed. Previous VDY-003B Android SQLite screenshots remain unchanged in `docs/progress/evidence/android-2026-11-05/`.
- GitHub CI: PASS on PR #11 code head `8d110e93c4e663c7aa6fcb52eb6df9813b0c6f74`; `Verify Expo scaffold` job 127144494014 / Actions run 41997597725.
- Independent R2 reviewer: final APPROVE after fixes; no P0/P1/P2. Draft PR #11 targets `feat/vdy-003b-sqlite-storage`; no merge.
- Separate open risks: R08 iOS/device coverage, R13 moderate npm audit findings, Ethernet Private-profile/GPO issue. No merge or release.
