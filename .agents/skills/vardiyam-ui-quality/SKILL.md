---
name: vardiyam-ui-quality
description: Use when designing or reviewing Vardiyam mobile UI, accessibility, theme, navigation, or interaction quality.
---

# Vardiyam UI Quality — v1.0

UI dışı görevlerde kullanma. UI işinde UI Skills CLI'dan yalnız en küçük ilgili beceriyi getir (`npx ui-skills categories`, `npx ui-skills list --category <category>`, `npx ui-skills get <slug>`); harici MCP'yi sürekli açık tutma. Önce React Native/Expo ve platforma özgü becerileri ara. `baseline-ui` Tailwind/web kuralları içerir; native Expo işine uygun değilse yükleme/uygulama.

**Tetikleyiciler:** Her kullanıcı arayüzü, navigasyon, metin, tema veya etkileşim değişikliğinde zorunlu.

1. İlgili tasarım tokenlarını, kullanıcı kabul ölçütlerini ve etkilenen UI bileşenlerini oku; görevin kapsamıyla ilgisiz tasarım dokümanlarını yükleme. Yeni component library eklemeden önce mevcut yapıyı değerlendir.
2. Ana ajan ekranın bilgi hiyerarşisi, birincil CTA ve etkilenen empty/loading/error/disabled/offline durumlarını planlasın. Reviewer ajanı yalnız anayasa §12 risk sınıfı gerektiriyorsa çağır.
3. Vardiya takviminde yalnız renk kullanma; ikon/kod/etiket ekle. Kazançta brüt, bordro neti ve alınan net ödemeyi açıkça ayır.
4. Değişikliğin etkilediği light/dark, ekran boyutu, büyük yazı, ekran okuyucu, klavye, tek elle kullanım ve reduced motion senaryolarından gerekli olanları denetle; her UI görevi için tüm matrisi tekrar çalıştırma.
5. Normal metinde 4.5:1 kontrast hedefi; erişilebilir dokunma alanları; form validation, double-submit ve geri alma davranışı.
6. UI Skills CLI/skill erişimi gerektiğinde gerçek komutla doğrula ve en fazla 1–3 hedefli beceri kullan; web-only/Tailwind kurallarını React Native'e körlemesine uygulama.
7. Gerçek cihaz ekran görüntüsü ve smoke testi olmadan 'görsel test PASS' deme. Simülatör/preview ile cihazı ayır.
8. Reviewer eşiği varsa UX/a11y bulgularını P0–P3 sınıflandır; P0/P1 kapanmadan Done yok.
9. `docs/progress/PROGRESS.md` içine ekran/cihaz/tema/font/kanıt/reviewer kaydı ekle.

**Çıktı:** değişen ekranlar, önce/sonra farkı, erişilebilirlik kontrolleri, screenshot yolları, gerçek test sonucu, açık sorunlar.
