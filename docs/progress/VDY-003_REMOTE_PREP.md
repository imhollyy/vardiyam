# VDY-003 — GitHub uzaktan hazırlık handoff

**Tarih:** 2026-11-05
**Durum:** PREPARED_ONLY (VDY-003 ürün kodu henüz yazılmadı)
**Repo:** imhollyy/vardiyam
**Başlangıç tabanı:** PR #4 head dd87e8ef2d79a595f5a2187988679ecd9a2079fb
**Ayrı branch:** docs/vdy-003-shift-cycle-contract
**Bağlı issue:** #5

## Neden ayrı belge?

PR #4'te VDY-002D cihaz testlerinin BLOCKED olduğu ve kullanıcının yerel PROGRESS dosyasının güncel kaldığı raporlandı. GitHub doküman hazırlığı, yerel çalışma alanına erişmeden yapılıyor. Bu nedenle `docs/progress/PROGRESS.md` uzaktan **değiştirilmedi**; yerel Codex sonraki oturumda handoff'u resmi PROGRESS'e aktarabilir.

## Yapılan

- `docs/SHIFT_CYCLE_CONTRACT.md`: saf vardiya döngüsü ve tek günlük override hesaplama sözleşmesi.
- `tests/fixtures/shift-cycle-cases.json`: sentetik, makinece okunabilir 30 projeksiyon, 5 override, 4 nominal saat aralığı, 11 olumsuz giriş vaka tanımı.
- `docs/tasks/VDY-003.md`: VDY-003A (saf TS unit), B (SQLite v2), C (UI/cİhaz) alt işleri.
- Ayrı stacked draft PR; ana dal ve PR #4'teki uygulama dosyalarına dokunulmadı.

## Gerçek kanıt ve eksikler

- 30 projeksiyonun beklenen index/entry alanları, belge hazırlanırken bağımsız UTC-takvim-günü hesabıyla tutarlılık kontrolünden geçirildi (doküman üretim doğrulaması).
- **Node ürün testleri, Expo uygulaması, Android/iOS, SQLite migration, lint/typecheck, Codex alt ajanlar bu uzaktan doküman hazırlığında ÇALIŞTIRILMADI.**
- Bu çalışma anayasa v1.1 kapsamında **R1 belge/fixture ön hazırlığı** olarak değerlendirildi. Kod ve DB migration çıktığı anda Codex uygun R2+ reviewer ve ilgili skill kapısını yeniden uygular.
- Fixture içindeki nominal süreler yerel duvar saati süreleridir; geçmiş DST UTC dönüşümüne dair cihaz kanıtı oluşturmaz.

## NEXT ACTION

Codex yerelde PR #4 branch temizliğini doğrulasın; sonra ayrı VDY-003A feature branch'i açıp sözleşme ve fixture'ları uygulama testlerine dönüştürsün. VDY-002D Android cihaz kurulumunu ayrı izlemeye devam et. PR #4 veya PR #5 merge edilmesin; kurucu onayı beklensin.
