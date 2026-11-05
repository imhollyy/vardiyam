# Vardiyam — Karar Günlüğü (ADR-lite)

> `APPROVED` olmayan kararlar öneridir. Tarihçe silinmez; değişiklik yeni kayıtla yapılır.

| ID | Tarih | Karar / öneri | Durum | Gerekçe / onay |
|---|---|---|---|---|
| ADR-001 | 2026-11-05 | İlk hedef fabrika/üretim vardiyalı çalışanları | USER_STATED | Ürün odağı |
| ADR-002 | 2026-11-05 | İşyerine göre değiştirilebilir +%50 normal mesai, +%100 hafta sonu/hafta tatili, +%100 özel gün başlangıç profili | USER_STATED | Kullanıcı ihtiyacı; yasal oran diye etiketlenmez |
| ADR-003 | 2026-11-05 | Kullanıcı fiilen aldığı net ödemeyi elle kaydedebilir | USER_STATED | Gerçek ödeme takibi |
| ADR-004 | 2026-11-05 | React Native + Expo + TypeScript + SQLite; offline-first, hesap zorunluluğu yok | PROPOSED | Kısa geliştirme, düşük sunucu maliyeti |
| ADR-005 | 2026-11-05 | Tam Kare'nin AGENTS/Constitution/Quality Tooling yaklaşımı uyarlanır | USER_STATED + PROPOSED | İzlenebilir ajan geliştirme |
| ADR-006 | 2026-11-05 | Her task'ta gerçek uygulayıcı + bağımsız reviewer alt ajan ve repo skill | SUPERSEDED_BY_ADR-012 | İlk kalite kapısı; 2026-11-05'te kurucu talebiyle risk bazlı modele geçirildi |
| ADR-007 | 2026-11-05 | 4 sekme Bugün/Takvim/Kazanç/Ayarlar, ücretsiz çekirdek, tek seferlik Pro | PROPOSED | Basit UX ve düşük bakım |
| ADR-008 | 2026-11-05 | Anayasa v1.0-rc1 PR ile incelemeye sunulur; merge ve production kurucu onayıyla | PROPOSED | Tam Kare git disiplini |
| ADR-009 | 2026-11-05 | Yasal kurallar ve işyeri ücret politikası ayrı sürümlenir | PROPOSED | Yanlış hakediş iddiasını önleme |
| ADR-010 | 2026-11-05 | 149 TL Pro fiyatı yalnız test hipotezi | PROPOSED | Fiyat testi bekliyor |
| ADR-011 | 2026-11-05 | PROJECT_CONSTITUTION.md v1.0 bütünüyle geliştirme anayasası olarak onaylandı; bölüm 14'teki açık kararlar ayrı onay bekler | APPROVED | Kurucu sohbet içinde açıkça 'onaylıyorum' dedi; PR #1 için merge yetkisi |
| ADR-012 | 2026-11-05 | Ajan ve beceri kullanımı kredi verimliliği için risk bazlıdır (R0–R3); R2/R3 bağımsız review ister, R0/R1 ana ajanla tamamlanabilir. Progress olağan task başına en fazla üç checkpoint. Codex subagent varsayılanı gpt-6-luna/low ve eşzamanlı sınır 2; Context7/UI Skills görev başına CLI/skill, OpenAI Docs MCP yalnız Codex/OpenAI dokümanı gerektiğinde; Graphify kod oluştuktan sonra değerlendirilir. | APPROVED | Kurucunun ekli talebi; anayasa §12 v1.1 ile aynı değişiklik |
| ADR-013 | 2026-11-05 | Ücret girişi opsiyoneldir; ürün aylık brüt, saatlik brüt ve yalnız net ödeme takibini destekler. Aylık saat böleni işyeri profiline bağlıdır; onaysız sabit kabul edilmez. Hafta sonu, gerçek hafta tatili, resmî tatil ve işyeri özel tatili ayrıdır; +%50/+%100/+%100 işyeri başlangıç oranları değiştirilebilir. Çakışan oranlar toplanmaz; uygulanan kural açıklanır, belirsizlikte uyarı ve manuel düzeltme sunulur. Bordro dönemi yapılandırılabilir; tahmini brüt, bordro neti ve fiilî net ödeme ayrıdır; net-only kullanıcıya brüt tahmini gösterilmez. | APPROVED | Kurucunun GitHub Issue #3'teki 2026-11-05 onayı; yalnız ürün şartnamesi/VDY-002 kapsamı, merge/release yetkisi vermez |
| ADR-014 | 2026-11-05 | Q1: Ücret onboarding'in son ve isteğe bağlı adımıdır: aylık brüt, saatlik brüt, yalnız net ödeme veya şimdilik geç. Q2: 225 saat işyeri profilinde düzenlenebilir başlangıç önerisidir; kullanıcı açıkça onaylamadan hesapta kullanılmaz ve sürümlenir. Q3: Çakışmada geçerli en yüksek tek katsayı seçilir; oranlar toplanmaz, kural açıklanır ve eşit/çözümlenmemiş durumda uyarı + manuel düzeltme sunulur. | APPROVED | Kurucunun GitHub Issue #3'teki 2026-11-05 açık onayı; işyeri başlangıç politikası, yasal iddia değildir |

## Açık kurucu kararları

- **Q1–Q3:** 2026-11-05'te GitHub Issue #3 üzerinden onaylandı; ADR-014 ve `PRODUCT_SPEC.md` içine kapsam sınırlarıyla kaydedildi.
- **Q4:** Pro özellikleri/fiyatı ve ücretsiz özelliklerin son ayrımı?
- **Q5:** Ana branch akışı: Tam Kare'deki develop -> main mi, yoksa MVP için PR -> main mi?
- **Q6:** Uygulama adının mağaza/marka araştırması sonrası nihai durumu?
- **Q7:** Anayasa v1.0 onaylandı. İlk 4 ekranın görsel yönü için kurucu seçimi bekleniyor.
