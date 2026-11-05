# VDY-008A — Veritabanı Kurtarma Güvenliği Düzeltmesi

**Durum:** IMPLEMENTED / R3 REVIEW PENDING FINAL CI — 2026-11-05

**Issue:** [#26](https://github.com/imhollyy/vardiyam/issues/26)

**PR:** [#25](https://github.com/imhollyy/vardiyam/pull/25)
**Branch:** `feat/vdy-008-backup-restore-data-wipe` (PR #25 branch)

## Bulgu ve kapsam

İnceleme bulgusu doğrulandı: eski `committed` marker yalnız `vardiyam.db` dosyasının varlığına bakıp rollback kopyasını temizleyebiliyordu. Bu, cihazda yaşanmış bir veri kaybı olarak raporlanmıyor. Yalnız recovery marker/akışı düzeltildi; dışa aktarılan yedek dosya biçimi ve v1–v6 migration geçmişi değişmedi.

## Düzeltme

- Recovery marker sürüm 2; staged candidate ve rollback için ayrı SHA-256 serialization digest ve bütün user-table satır sayısı kaydeder. Eski hash yeni DB'ye karşı kullanılmaz.
- Candidate `PREPARED` öncesi validate edilir; yeni canlı DB tekrar açıldıktan sonra integrity, FK, migration-derived canonical schema, koruma trigger'ları, satır sayısı ve candidate digest doğrulanmadan `COMMITTED` yazılmaz.
- Başlangıç recovery'si `COMMITTED` candidate'ı aynı kontrollerle doğrular. Candidate bozuksa rollback'i doğrular ve **kopyalar**; kaynak rollback, canlı kopya yeniden doğrulanıp journal cleanup'a geçene kadar tutulur.
- Rollback/cleanup kesintisi tekrar açılışta güvenle tekrarlanır. Marker bozuksa, canlı DB doğrulanmıyorsa ve kullanılabilir rollback yoksa recovery marker/kopyaları korur ve provider veritabanını açmadan fail-closed kalır.
- Restore ve wipe aynı `replaceLiveDatabase`/recovery korumalarını kullanır.

## Kanıt

- Gerçek Node SQLite dosyaları ve geçici dosya sistemiyle sentetik v6 DB recovery integration testleri eklendi: valid commit cleanup, corrupt live + valid rollback, missing/corrupt rollback fail-closed, wipe boş v6, cleanup kesintisi, rollback kopyasından sonra kesinti/tekrar açılış, corrupt marker.
- `npm run typecheck`: PASS; `npm run lint`: PASS; `npm test`: PASS 248/248 (önceki 243 korunmuş, 5 test eklendi); Expo Doctor: PASS 20/20; Android JS export: PASS 1,252 modül; diff check: PASS.
- GitHub CI, commit/push sonrası kaydedilecek.
- Bağımsız R3 security reviewer: **APPROVE; P0/P1/P2 yok**. Uzman SQLite recovery incelemesi candidate/rollback hash ayrımı, rollback saklama ve idempotent recovery sırasını destekledi.
- Gerçek Expo native dosya sistemi/cihaz cold-restart: NOT RUN; dosya tabanlı Node SQLite testleri cihaz kabulü olarak gösterilmiyor.

## Koruma ve açık kanıt sınırı

Yerel unstaged `docs/tasks/VDY-004.md`, `docs/tasks/VDY-007.md` ve `expo-env.d.ts` korunacak; main/önceki PR merge ve release yok. R08, R13, Ethernet güvenlik politikası ve Türk iş hukuku incelemesi değişmeden açık kalır.

**NEXT ACTION:** Son R3 incelemesini ve PR #25 için yeni GitHub CI sonucunu kaydet; ardından VDY-009 Android kullanıcı kabulüne geç.
