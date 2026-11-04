# Vardiyam — Risk Defteri

| ID | Öncelik | Risk | Önlem / kapı | Durum |
|---|---|---|---|---|
| R01 | P0 | Mesai/tatil çakışmasında yanlış ücret | Kural sürümü, segmentasyon, QA fixture, hukuk incelemesi | OPEN |
| R02 | P0 | Veri kaybı / bozuk yedek / yıkıcı migration | SQLite transaction, round-trip test, geri yükleme önizlemesi | OPEN |
| R03 | P0 | Tahmini brüt ile fiilî netin yanlış karşılaştırılması | Üçlü ayrım, UX review, açıklamalı etiketler | OPEN |
| R04 | P1 | Fabrika gece/hafta tatili hukuk istisnaları | Kaynaklı uyarı, kullanıcı override, hukuk uzmanı | OPEN |
| R05 | P1 | 'SQLite şifreli' varsayımı ve yedek mahremiyeti | Şifreleme uygulama testi, OS sandbox, izin envanteri | OPEN |
| R06 | P1 | Public GitHub deposuna gerçek bordro veya secret yüklenmesi | .gitignore, sentetik fixtures, secret scan | OPEN |
| R07 | P1 | Alt ajan ve repo skill'lerinin Codex'te gerçekten kullanılamaması / sandbox repo erişiminin Git hatası sanılması | VDY-001 doğruladı: real subagents, six project skills + Context7 skill; elevated git status ayırımı; R0–R3 orkestrasyon | CLOSED 2026-11-05 — kalan kapsam dışı araç durumu R12'de izlenir |
| R08 | P1 | İki platformda cihaz UX/erişilebilirlik açığı | Android+iOS gerçek cihaz, UI skill, screenshot review | OPEN |
| R09 | P1 | Mağaza test/IAP/restore ve hesap türü bekleme süresi | Erken console hazırlığı, sandbox ve kapalı test | OPEN |
| R10 | P2 | MVP kapsamının büyümesi | G0–G5 kapıları, yeni özellik için kurucu onayı | OPEN |
| R11 | P2 | 'Vardiyam' isim/marka çakışması | App Store/Play Store/TÜRKPATENT araştırması | OPEN |
| R12 | P2 | Dış MCP/skill araçlarının veri/telemetri paylaşımı | Önce izin ve sağlayıcı incelemesi | OPEN |

**P0/P1 açık riskle production release yapılamaz.** Risk kapatma: kanıt, tarih, reviewer ve kurucu onayı.
