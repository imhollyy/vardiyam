---
name: vardiyam-ui-quality
description: Vardiyam'da Bugün, Takvim, Kazanç, Ayarlar ve onboarding ekranlarının premium mobil görünümünü, erişilebilirliğini ve etkileşim kalitesini tasarlamak veya denetlemek için kullanılır.
---

# Vardiyam UI Quality — v1.0

**Tetikleyiciler:** Her kullanıcı arayüzü, navigasyon, metin, tema veya etkileşim değişikliğinde zorunlu.

1. `docs/DESIGN_SYSTEM.md`, `PRODUCT_SPEC.md` ve mevcut UI bileşenlerini oku. Yeni component library eklemeden önce mevcut yapıyı değerlendir.
2. UI alt ajanı önce ekranın bilgi hiyerarşisi, 1 ana CTA, empty/loading/error/disabled/offline durumlarını tasarlasın.
3. Vardiya takviminde yalnız renk kullanma; ikon/kod/etiket ekle. Kazançta brüt, bordro neti ve alınan net ödemeyi açıkça ayır.
4. Light/dark, küçük Android, büyük iPhone, büyük yazı, ekran okuyucu, klavye açılması, tek elle kullanım ve reduced motion senaryolarını denetle.
5. Normal metinde 4.5:1 kontrast hedefi; erişilebilir dokunma alanları; form validation, double-submit ve geri alma davranışı.
6. Tam Kare'deki UI Skills MCP/CLI erişimi **gerçekten doğrulanırsa** uygun 1–3 hedefli beceri kullan; web-only/Tailwind kurallarını React Native'e körlemesine uygulama.
7. Gerçek cihaz ekran görüntüsü ve smoke testi olmadan 'görsel test PASS' deme. Simülatör/preview ile cihazı ayır.
8. Bağımsız UX/a11y reviewer bulgularını P0–P3 sınıflandır; P0/P1 kapanmadan Done yok.
9. `docs/progress/PROGRESS.md` içine ekran/cihaz/tema/font/kanıt/reviewer kaydı ekle.

**Çıktı:** değişen ekranlar, önce/sonra farkı, erişilebilirlik kontrolleri, screenshot yolları, gerçek test sonucu, açık sorunlar.
