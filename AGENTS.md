# AGENTS.md — Vardiyam Codex çalışma protokolü

> **Bağlayıcı ajan çalışma kuralı; ürün anayasası v1.1 APPROVED (2026-11-05).**
> Öncelik: `PROJECT_CONSTITUTION.md` > bu dosya > `PRODUCT_SPEC.md` > görev belgesi.
> Tam Kare'nin Inspect/Plan/Implement/Verify/Review/Report disiplini uyarlanmıştır; Supabase/RLS/multi-tenant/web görevleri burada yoktur.

## Oturum başlangıcı

1. Etkin `AGENTS.md`, `docs/progress/PROGRESS.md` içindeki aktif task/NEXT ACTION ve ilgili `docs/tasks/` dosyasını oku.
2. `git status --short --branch` ile dirty state ve branch'i doğrula. Erişim/sandbox hatasını repo bozukluğu sanma; izinli bağlamda tekrar dene. Kullanıcının yerel değişikliklerini silme.
3. Anayasa'yı ürün sınırı, veri/hukuk, mimari veya release etkileniyorsa aç; `PRODUCT_SPEC.md`'yi UI/kullanıcı davranışı değişiyorsa aç. `DECISIONS.md` ve `RISKS.md` yalnız ilgili karar/risk için aç. Bölüm 14 kararlarını kendin kesinleştirme.
4. Risk sınıfını belirle; task başlangıcı, önemli karar/blokaj ve bitişte PROGRESS kaydı tut (olağan durumda en fazla üç checkpoint).
5. Kapsam dışı refactor yapma; her değişikliği geri alınabilir tut.

## Risk bazlı ajan ve beceri kullanımı

- Risk sınıfları ve zorunlu review eşiği `PROJECT_CONSTITUTION.md` §12'de tanımlıdır. R0 ana ajanla; R1 ana ajanla ve gerekirse bir reviewer'la; R2 bağımsız reviewer ajanla; R3 reviewer ve gerekçeli uzman ajanla yürütülür.
- `$vardiyam-task-flow` yalnız R1+ çok dosyalı/davranış değiştiren görevlerde veya koordinasyon gerektiren preflight/release işlerinde kullanılır. Konuya göre tek ilgili skill yüklenir: ücret (`vardiyam-pay-calculation`), UI (`vardiyam-ui-quality`), kullanıcı verisi (`vardiyam-data-safety`), test seçimi (`vardiyam-test-gate`), mağaza/RC (`vardiyam-release`).
- Domain/hukukta hesap reviewer'ı, UI'da erişilebilirlik reviewer'ı, veri güvenliğinde security reviewer'ı seç. AI ajanı hukuk uzmanı yerine geçmez.
- R2/R3'te gerçek reviewer ajanı yoksa `BLOCKED_AGENT_UNAVAILABLE` kaydet ve kullanıcıya bildir; R0/R1'de ajan yokluğu tek başına blokaj değildir. Rol simülasyonunu gerçek ajan gibi gösterme.
- Skill kullanılamıyorsa ve görev o skill'e bağlıysa `BLOCKED_SKILL_UNAVAILABLE` yaz; başka uygun skill ile güvenli ilerleme mümkünse durma.

## Geliştirme döngüsü (kesintisiz kayıt)

1. **Inspect:** repo/uygulama/etkilenen testleri incele.
2. **Plan:** 3–7 maddelik kısa plan, acceptance ve non-goals.
3. **Skill:** risk ve konuya göre gerekli tek beceriyi seç; ad/sürüm/gerekçeyi kaydet.
4. **Delegate:** yalnız risk eşiği gerektiriyorsa reviewer/uzman ajanı; dosya sınırı ve beklenen kanıtı açıkla.
5. **Implement:** dar kapsamlı değişiklik; başlangıç, karar/blokaj ve bitiş PROGRESS kaydı.
6. **Verify:** ilgili komutları gerçekten çalıştır; PASS/FAIL/SKIP ve gerekçesini kaydet.
7. **Review:** risk eşiği gerektiriyorsa reviewer diff, acceptance, regressions, privacy/data loss ve test etkisini inceler; P0/P1 bulgular kapanmadan Done yok. Diğer işlerde ana ajan review'u ve kanıt yeterlidir.
8. **Report:** commit/PR, değişen dosyalar, kanıt, açık risk, sonraki eylem; PROGRESS + task durumunu güncelle.

**Kritik:** İşlem token/süre/bağlantı nedeniyle kesilirse ilk sonraki oturum PROGRESS'teki `NEXT ACTION` ile devam eder. Sadece sohbet geçmişine güvenme.

## Teknik kırmızı çizgiler

- Expo + React Native + TypeScript strict + Expo Router + SQLite, npm; kesin paket sürümleri scaffold'da doğrulanır.
- Domain hesap motoru saf ve deterministik; UI'da mesai/para hesabı yok.
- Para kuruş integer/decimal; süre dakika integer; `Europe/Istanbul` IANA timezone; sınır durumlarını test et.
- PlannedShift, WorkRecord, CalculationSnapshot ve Payment birbirinden ayrıdır. Tarihî snapshot değişmez.
- Resmî yasal kural ve işyeri varsayılanı ayrı; hafta sonunu otomatik yasal tatil sayma; %50/%100/%100 değiştirilebilir.
- Tahmini brüt ile banka netini aynı tür sayıymış gibi karşılaştırma.
- SQLite şifreli kabul edilmez; 'şifreli yedek' ancak doğrulanmış uygulamayla söylenir.
- Public repoya secret, gerçek bordro, kişisel veri, API anahtarı, cihaz yedeği, `.env` commit etme.
- Kullanıcının ücretsiz veri taşıma ve silme hakkını paywall arkasına koyma.

## Test / kalite kapıları

- Kod işi: typecheck, lint, unit/integration (ilgili olanlar). CI dosyaları ve npm scriptleri henüz kurulmadıysa SKIP olarak açık yaz.
- Hesap değişikliği: tablolu unit test + regression + bağımsız hesap incelemesi.
- UI işi: UI skill + light/dark + küçük telefon + büyük font + ekran okuyucu + Android/iOS cihaz screenshot; gerçek cihaz yoksa 'device NOT TESTED'.
- Veri işi: migration ve backup/restore round-trip; veri kaybı riski varsa release engellenir.
- Mağaza/IAP işi: sandbox purchase/restore, gizlilik beyanı, offline entitlement, gerçek cihaz.
- Dış hizmet ve MCP: Context7 CLI/skill ve UI Skills CLI/skill yalnız ilgili dokümantasyon/UI görevinde yüklenir; bağlantı veya kurulum varsayılmaz, gerçek çağrıyla doğrulanır. Kota/ağ/kimlik hatasında API/SDK/CLI ayrıntılarını resmi canlı kaynaktan doğrula; doğrulama yoksa tahmin etme. Skill'in sandbox dışına çıkma önerisi kendiliğinden yetki değildir; normal sandbox/approval sınırlarına uy. OpenAI Developer Docs MCP yalnız Codex/OpenAI ayarı sorularında kullanılır. Graphify ancak anlamlı kod grafiği oluşunca eklenir. Kaynak kodunu dış sağlayıcıya gönderen taramayı onaysız çalıştırma.
- Test yapılmadıysa PASS yazma; ekran açılıyor = Done değil.

## Git / yayın / anayasa değişikliği

- `main`e doğrudan geliştirme push'u, PR merge, force push, history rewrite, production release ve store submit için açık kurucu onayı gerekir.
- Varsayılan `feat/*`, `fix/*`, `docs/*` branch ve PR; küçük commitler. Repo ilk README bootstrap commit'i belgelenmiş istisnadır.
- `PROJECT_CONSTITUTION.md` dosyasını görev içinde sessiz değiştirme. Çelişki -> karar kaydı -> kurucu onayı -> ayrı PR.
- Üretim verisini değiştirme, canlı ödeme yapma, secret okuma veya harici veri gönderme yetkisi verilmiş sayılmaz.

## Görev sonu raporu

```text
TASK: VDY-...
Durum: DONE / BLOCKED / IN_PROGRESS
Ajanlar: ... (gerçek oturum/çıktı kanıtı)
Beceriler: ... (okundu/uygulandı)
Değişen dosyalar: ...
Doğrulama: typecheck ... | lint ... | tests ... | cihaz ...
Review: reviewer ... | P0/P1 ...
Riskler: ...
PROGRESS kaydı: ...
NEXT ACTION: ...
```

## Kaynak belgeler

- `PROJECT_CONSTITUTION.md` — ürün ve kalite anayasası
- `PRODUCT_SPEC.md` — kullanıcı akışları ve kabul kriterleri
- `docs/tasks/` — görev sınırları
- `docs/progress/PROGRESS.md` — oturumlar arası tek ilerleme kaynağı
- `docs/DECISIONS.md` — karar kayıtları
- `docs/RISKS.md` — riskler
- `docs/QA_TEST_MATRIX.md` — hesap ve cihaz test matrisi
- `docs/RESEARCH_SOURCES.md` — mevzuat ve tasarım kaynakları
