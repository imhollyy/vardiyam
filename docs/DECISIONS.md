# Vardiyam — Karar Günlüğü (ADR-lite)

> `APPROVED` olmayan kararlar öneridir. Tarihçe silinmez; değişiklik yeni kayıtla yapılır.

| ID | Tarih | Karar / öneri | Durum | Gerekçe / onay |
|---|---|---|---|---|
| ADR-001 | 2026-11-05 | İlk hedef fabrika/üretim vardiyalı çalışanları | USER_STATED | Ürün odağı |
| ADR-002 | 2026-11-05 | İşyerine göre değiştirilebilir +%50 normal mesai, +%100 hafta sonu/hafta tatili, +%100 özel gün başlangıç profili | USER_STATED | Kullanıcı ihtiyacı; yasal oran diye etiketlenmez |
| ADR-003 | 2026-11-05 | Kullanıcı fiilen aldığı net ödemeyi elle kaydedebilir | USER_STATED | Gerçek ödeme takibi |
| ADR-004 | 2026-11-05 | React Native + Expo + TypeScript + SQLite; offline-first, hesap zorunluluğu yok | PROPOSED | Kısa geliştirme, düşük sunucu maliyeti |
| ADR-005 | 2026-11-05 | Tam Kare'nin AGENTS/Constitution/Quality Tooling yaklaşımı uyarlanır | USER_STATED + PROPOSED | İzlenebilir ajan geliştirme |
| ADR-006 | 2026-11-05 | Her task'ta gerçek uygulayıcı + bağımsız reviewer alt ajan ve repo skill | USER_STATED | Kalite kapısı; erişim Codex local'de doğrulanacak |
| ADR-007 | 2026-11-05 | 4 sekme Bugün/Takvim/Kazanç/Ayarlar, ücretsiz çekirdek, tek seferlik Pro | PROPOSED | Basit UX ve düşük bakım |
| ADR-008 | 2026-11-05 | Anayasa v1.0-rc1 PR ile incelemeye sunulur; merge ve production kurucu onayıyla | PROPOSED | Tam Kare git disiplini |
| ADR-009 | 2026-11-05 | Yasal kurallar ve işyeri ücret politikası ayrı sürümlenir | PROPOSED | Yanlış hakediş iddiasını önleme |
| ADR-010 | 2026-11-05 | 149 TL Pro fiyatı yalnız test hipotezi | PROPOSED | Fiyat testi bekliyor |
| ADR-011 | 2026-11-05 | PROJECT_CONSTITUTION.md v1.0 bütünüyle geliştirme anayasası olarak onaylandı; bölüm 14'teki açık kararlar ayrı onay bekler | APPROVED | Kurucu sohbet içinde açıkça 'onaylıyorum' dedi; PR #1 için merge yetkisi |

## Açık kurucu kararları

- **Q1:** Aylık brüt/saatlik brüt/aylık net girişinde varsayılan hangisi? Net giren için brüt tahmininin sınırı nasıl anlatılacak?
- **Q2:** Maaş hesap döneminin başlangıcı ve saatlik ücret için aylık bölen yöntemi nasıl seçilecek?
- **Q3:** Çakışan mesai/tatil katsayılarında hangi işyeri politikası başlangıçta önerilecek?
- **Q4:** Pro özellikleri/fiyatı ve ücretsiz özelliklerin son ayrımı?
- **Q5:** Ana branch akışı: Tam Kare'deki develop -> main mi, yoksa MVP için PR -> main mi?
- **Q6:** Uygulama adının mağaza/marka araştırması sonrası nihai durumu?
- **Q7:** Anayasa v1.0 onaylandı. İlk 4 ekranın görsel yönü için kurucu seçimi bekleniyor.
