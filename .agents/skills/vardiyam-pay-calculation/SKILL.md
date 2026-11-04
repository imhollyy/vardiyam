---
name: vardiyam-pay-calculation
description: Vardiyam'ın vardiya süresi, mola, fazla mesai, tatil, brüt hakediş, bordro neti ve ödeme mutabakatı mantığı değişirken hesap doğruluğu ve mevzuat ayrımı denetimi için kullanılır.
---

# Vardiyam Pay Calculation — v1.0

**Tetikleyiciler:** WorkRecord, WorkSegment, PayRule, Holiday, PayPeriod, CalculationSnapshot, Payment veya ücret gösterimi değişiyorsa zorunlu.

1. İlgili anayasa ve `docs/QA_TEST_MATRIX.md` oku; yasal bilgilendirme ile işyeri varsayılanını ayır.
2. Planlanan ve fiilî çalışma sürelerini ayır; UTC instant, IANA timezone, dakika hassasiyeti, mola ve 13:00 yarım gün tatil sınırlarını modelle.
3. Haftalık sözleşme saati, 45 saat sınırı, fazla sürelerle çalışma (+%25), fazla çalışma (+%50), hafta tatili ve UBGT kavramlarını farklı tut. Cumartesi/pazarı otomatik hafta tatili sayma.
4. Kullanıcı varsayılanları normal +%50, hafta tatili/hafta sonu +%100, özel gün +%100; bu oranlar **işyeri politikasıdır** ve değiştirilebilir. Yasal hak diye sunma.
5. Aynı dakika/maaşa dahil baz ücreti iki kez ekleme. Kural çakışması için açık priority policy ve açıklanabilir breakdown.
6. Para kuruş integer veya güvenilir decimal; süre dakika integer; yuvarlama testli. Snapshot ruleVersion ve baz değerleri içerir.
7. Tahmini brüt, bordro neti ve fiilî ödeme ayrı. Brüt–net farkından 'eksik maaş' çıkarımı yapma.
8. Değişiklikten **önce** tablolu test fixture'ı yaz; sonra implementasyon; sonra bağımsız calculation reviewer ve QA.
9. Belirsiz mevzuat/istisna durumunda güvenli uyarı + uzman incelemesi için kayıt; kesin bordro garantisi verme.
10. PROGRESS kaydına test ID, beklenen/gerçek, ruleVersion, reviewer ve risk ekle.

**Engel:** P0 hesap uyuşmazlığı, çakışma çift sayımı, sessiz tarihî hesap değişimi veya veri kaybı -> görev BLOCKED/FAIL.
