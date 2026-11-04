# Vardiyam — Kalıcı İlerleme Günlüğü

> **Tek oturumlar arası durum kaynağı.** Her görev başlangıcında, önemli checkpoint'te ve bitişte güncelle. Son durum değiştirilebilir; geçmiş olaylar silinmez. Gerçekten çalıştırılmayan test PASS değildir.

## CURRENT STATE

- **Tarih:** 2026-11-05
- **Proje:** Vardiyam
- **Aktif aşama:** G0 — araştırma + anayasa + Codex geliştirme düzeni
- **Durum:** IN_REVIEW / kurucu anayasa onayı bekleniyor
- **Aktif branch:** `docs/constitution-v1-and-codex-harness`
- **Ana depo:** `imhollyy/vardiyam`
- **Ürün kodu:** HENÜZ YOK
- **Expo/SQLite scaffold:** NOT STARTED
- **Gerçek alt ajan çağrısı:** NOT RUN — bu GitHub belge hazırlama oturumunda Codex local alt ajan çalıştırma aracı mevcut değil.
- **Repo skill kullanımı:** Dosyalar PR'da önerilecek; Codex ortamında çağrılma testi NOT RUN.
- **Typecheck / lint / test / cihaz:** NOT RUN — henüz uygulama/yerel yürütme ortamı yok.
- **Kurucu onayı:** PENDING
- **Önemli uyarı:** GitHub deposu public; gerçek ücret ve kişisel veri commit edilmez.

## NEXT ACTION (ilk açılışta bunu yap)

1. Kurucu anayasa PR'ını gözden geçirip açık kararları yanıtlasın.
2. Local Codex, repo checkout'u üzerinde `AGENTS.md` + `.agents/skills/` dosyalarını gerçekten okusun; alt ajan desteğini doğrulasın. `codex mcp list` ve UI Skills/Context7 erişimini gerçek çağrıyla denetlesin.
3. VDY-001 görevini onaylanmış kurallara göre başlat; START/VERIFY/REVIEW kayıtları ekle.
4. Expo scaffold ve CI yalnız VDY-002 kapsamında; typecheck/test çalışmadan 'bitti' deme.

## OLAY GÜNLÜĞÜ

### 2026-11-05 — G0 / VDY-000 — START

- **İş:** GitHub repo keşfi, Tam Kare çalışma düzenini gerçek dosyalardan inceleme, derin araştırma raporunu anayasaya uyarlama.
- **Kaynak:** `imhollyy/tam-kare` deposundaki `AGENTS.md`, `PROJECT_CONSTITUTION.md`, `.codex/config.toml`, `docs/development-quality-tooling.md`.
- **Uygulama:** Boş Vardiyam deposu README ile başlatıldı; anayasa ve harness ayrı branch üzerinde taslak.
- **Alt ajan:** GitHub bağlantısı üzerinden belge yazımı; bağımsız Codex alt ajan review'u **henüz yapılmadı**. Bu kayıt bunu tamamlanmış göstermez.
- **Skill:** Repo-local skill dosyaları oluşturulacak; Codex tarafından kullanımı doğrulanmadı.
- **Test:** SKIP (uygulama kodu ve yerel runtime yok).
- **Risk:** Ücret/hukuk hesaplarının uzman doğrulaması ve cihaz testi yayın öncesi zorunlu.

### 2026-11-05 — G0 / VDY-000 — CHECKPOINT

- **Ürün kararı:** Türkiye fabrika/üretim çalışanı, offline-first, premium UI, 4 sekme, işyeri varsayılanı +%50/+%100/+%100 özelleştirilebilir.
- **Hesap ilkesi:** Tahmini brüt, bordro neti, fiilen alınan net ödeme ayrıdır; geçmiş snapshot korunur.
- **Onay:** Henüz yok. Anayasa v1.0-rc1 olarak etiketlendi.
- **NEXT ACTION:** Kurucu incelemesi ve Codex local VDY-001.

## Her yeni görev için kayıt şablonu

```text
### YYYY-MM-DD HH:mm UTC — VDY-XXX — START/CHECKPOINT/VERIFY/REVIEW/DONE/BLOCKED
Branch/commit:
Amaç ve kapsam:
Gerçek alt ajanlar + rol/kanıt:
Okunan/uygulanan skill + sürüm:
Değişen dosyalar:
Test komutları ve gerçek PASS/FAIL/SKIP:
Bağımsız review bulguları:
Karar/risk:
NEXT ACTION:
```
