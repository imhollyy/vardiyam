# AGENTS.md — Vardiyam Codex çalışma protokolü

> **Bağlayıcı ajan çalışma kuralı; ürün anayasası v1.0-rc1 hâlen kurucu onayı bekliyor.**
> Öncelik: `PROJECT_CONSTITUTION.md` > bu dosya > `PRODUCT_SPEC.md` > görev belgesi.
> Tam Kare'nin Inspect/Plan/Implement/Verify/Review/Report disiplini uyarlanmıştır; Supabase/RLS/multi-tenant/web görevleri burada yoktur.

## Her oturumun ilk 5 dakikası

1. `PROJECT_CONSTITUTION.md`, `AGENTS.md`, `PRODUCT_SPEC.md`, `docs/progress/PROGRESS.md`, `docs/DECISIONS.md` ve açık task'ı oku.
2. `git status --short`, aktif branch, mevcut değişiklik ve son commit'i denetle. Kullanıcının yerel değişikliklerini silme.
3. En küçük doğrulanabilir görevi seç. Anayasa onaylanmadan çelişkili mimari veya ücret kuralı kesinleştirme.
4. `docs/progress/PROGRESS.md` dosyasına START kaydı ekle: tarih/UTC, task ID, branch, hedef, risk, alt ajanlar, skill.
5. Kapsam dışı refactor yapma; her değişikliği geri alınabilir tut.

## Her görevde zorunlu alt ajan + beceri

- **Her geliştirme görevi** en az iki gerçekten ayrı alt ajan rolü gerektirir: (A) uygulayıcı, (B) bağımsız reviewer. Ajanları mevcut Codex sürümünün desteklediği gerçek mekanizmayla başlat. Bir rolün çıktısını diğerine körü körüne onaylatma.
- Her görevde `$vardiyam-task-flow` becerisini aç ve uygula; ayrıca konuya göre `$vardiyam-pay-calculation` veya `$vardiyam-ui-quality` becerisini aç. Bu repo becerileri `.agents/skills/` altında bulunur.
- Domain/hukuk değişikliği: calculation ajanı + QA/reviewer; UI değişikliği: UI ajanı + a11y/reviewer; gizlilik/veri değişikliği: security reviewer; release: release reviewer. Uzman hukuki inceleme gerektiğinde AI ajanı hukuk uzmanı yerine geçmez.
- **Gerçek alt ajan özelliği mevcut değilse:** `BLOCKED_AGENT_UNAVAILABLE` yaz; kullanıcıya bildir; farklı oturum/insan review'u için açık onay al. Sahte ajan çıktısı veya 'çalıştırıldı' beyanı yasaktır.
- Skill erişilemiyorsa `BLOCKED_SKILL_UNAVAILABLE` yaz; gerçek dosyayı incelemeden kullanılmış sayma.
- İki ajan küçük işte yeterlidir; 3+ ajan yalnız risk gerekçesiyle. Paralel ajanlar aynı dosyayı eşzamanlı düzenlemez.

## Geliştirme döngüsü (kesintisiz kayıt)

1. **Inspect:** repo/uygulama/etkilenen testleri incele.
2. **Plan:** 3–7 maddelik kısa plan, acceptance ve non-goals.
3. **Skill:** kullanılacak beceri adı/sürümü ve gerekçesini görev dosyasına yaz.
4. **Delegate:** alt ajan görevlerini, dosya sınırlarını ve beklenen çıktıyı açık tanımla.
5. **Implement:** dar kapsamlı kod; her anlamlı checkpoint'te PROGRESS kaydı.
6. **Verify:** ilgili komutları gerçekten çalıştır; PASS/FAIL/SKIP ve gerekçesini kaydet.
7. **Review:** bağımsız alt ajan diff, hesap, veri, UX ve test etkisini inceler; P0/P1 bulgular kapanmadan Done yok.
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
- Dış hizmet ve MCP: Context7/UI Skills gibi araçların kurulu veya erişilebilir olduğu **varsayılmaz**; gerçek çağrı ve sürüm eşlemesiyle doğrula. Kaynak kodunu dış sağlayıcıya gönderen taramayı onaysız çalıştırma.
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
