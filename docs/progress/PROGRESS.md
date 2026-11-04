# Vardiyam — Kalıcı İlerleme Günlüğü

> **Tek oturumlar arası durum kaynağı.** Her görev başlangıcında, önemli checkpoint'te ve bitişte güncelle. Son durum değiştirilebilir; geçmiş olaylar silinmez. Gerçekten çalıştırılmayan test PASS değildir.

## CURRENT STATE

- **Tarih:** 2026-11-05
- **Proje:** Vardiyam
- **Aktif aşama:** G0 — ürün şartnamesi kurucu onay kapısı
- **Durum:** VDY-001 DONE; VDY-002 pre-gate şartname taslağı hazır, kurucu onayı bekliyor
- **Aktif branch:** `chore/vdy-001-agent-orchestration`
- **Ana depo:** `imhollyy/vardiyam`
- **Ürün kodu:** HENÜZ YOK
- **Expo/SQLite scaffold:** NOT STARTED
- **Gerçek alt ajan çağrısı:** Implementer + bağımsız reviewer önceki preflight'te; R2 reviewer son diff'i ayrıca inceledi ve düzeltmelerden sonra bulgu bırakmadı. Uzman ajan denemesi repo erişimi olmadığı için sayılmadı; R2 sınıfında uzman zorunlu değil.
- **Repo skill kullanımı:** 6 Vardiyam skill'i + Context7 `find-docs` vendor skill'i mevcut; UI Skills CLI on-demand gerçek fetch doğrulandı.
- **Yerel araçlar:** Node v24.20.0, npm 11.19.0, Codex CLI 0.165.0, Expo CLI 58.1.19.
- **MCP:** Project Context7 MCP disabled; OpenAI Developer Docs enabled. UI Skills MCP yok. Context7 CLI/Skills setup authenticated/completed.
- **Typecheck / lint / test / cihaz:** SKIP — ürün uygulaması/scaffold yok.
- **Kurucu onayı:** APPROVED (2026-11-05, anayasa v1.0 + ajan/skill orkestrasyonu v1.1; açık ürün kararları hariç)
- **Önemli uyarı:** GitHub deposu public; gerçek ücret ve kişisel veri commit edilmez.

## NEXT ACTION

1. Kurucu, `PRODUCT_SPEC.md` v0.1 taslağını ve açık Q1–Q3 (onboarding ücret seçimi; işyeri saat böleni yöntemi/değeri; yapılandırılmış çakışma önceliği) karara bağlayıp açık onay versin; bundan önce VDY-002 scaffold başlatma.

## OLAY GÜNLÜĞÜ

### 2026-11-05 — G0 / VDY-000 — FOUNDER APPROVED

- **Kurucu kararı:** 'onaylıyorum' — PROJECT_CONSTITUTION.md v1.0 geliştirme anayasası onaylandı.
- **Kapsam:** PR #1 dokümantasyonunun main'e merge edilmesine izin; bölüm 14'teki açık kararlar ayrıca kararlaştırılacak.
- **Ajan/skill:** GitHub doküman onay ve merge adımı; yerel Codex alt ajan ve skill çalıştırması NOT RUN.
- **Test:** Ürün kodu bulunmadığı için typecheck/lint/test/cihaz SKIP; GitHub PR merge durumu ayrıca doğrulanacak.
- **NEXT ACTION:** VDY-001 yerel preflight, sonra VDY-002 scaffold.


### 2026-11-05 — G0 / VDY-000 — START

- **İş:** GitHub repo keşfi, Tam Kare çalışma düzenini gerçek dosyalardan inceleme, derin araştırma raporunu anayasaya uyarlama.
- **Kaynak:** `yetkili Tam Kare iç deposu` deposundaki `AGENTS.md`, `PROJECT_CONSTITUTION.md`, `.codex/config.toml`, `docs/development-quality-tooling.md`.
- **Uygulama:** Boş Vardiyam deposu README ile başlatıldı; anayasa ve harness ayrı branch üzerinde taslak.
- **Alt ajan:** GitHub bağlantısı üzerinden belge yazımı; bağımsız Codex alt ajan review'u **henüz yapılmadı**. Bu kayıt bunu tamamlanmış göstermez.
- **Skill:** Repo-local skill dosyaları oluşturulacak; Codex tarafından kullanımı doğrulanmadı.
- **Test:** SKIP (uygulama kodu ve yerel runtime yok).
- **Risk:** Ücret/hukuk hesaplarının uzman doğrulaması ve cihaz testi yayın öncesi zorunlu.

### 2026-11-05 — G0 / VDY-000 — PR OPENED

- **Taslak PR:** https://github.com/imhollyy/vardiyam/pull/1 (draft; kurucu review bekleniyor).
- **Yapılan:** 20 dosyada anayasa, 4 repo-local skill, Codex protokolü, QA ve ilerleme kayıtları önerildi.
- **Gerçek doğrulama:** GitHub'da dosya/PR oluşturma başarılı. Yerel typecheck/lint/test/cihaz ve Codex alt ajan çağrısı **NOT RUN**.
- **Sonraki eylem:** Kurucu incelemesi; VDY-001 Codex local preflight.

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

### 2026-11-05 — G0 / VDY-001 — PREFLIGHT CHECKPOINT

Branch/commit:
- Branch lookup: `main`; `git rev-parse --show-toplevel` resolves `C:/Users/emrey/vardiyam`.
- `git status --short --branch`: FAIL (`fatal: this operation must be run in a work tree`); repository metadata exists but working-tree status is not operational in this session.
Amaç ve kapsam:
- Salt okunur Codex/skill/yerel araç preflight'i. Anayasa v1.0 APPROVED (2026-11-05); açık kararlar ayrıca bekliyor. Ürün koduna geçilmedi.
Gerçek alt ajanlar + rol/kanıt:
- Implementer ve bağımsız reviewer alt ajanları çağrıldı. Implementer raporu bekleniyor.
- Reviewer: repo erişimi kendi sandbox'ında engellendi; write erişiminin bu repo için olmadığını, Expo/UI Skills kanıtı eksik olduğunu doğruladı.
Okunan/uygulanan skill + sürüm:
- `.agents/skills/vardiyam-task-flow/SKILL.md` v1.0 okundu ve izlendi.
- `.agents/skills/vardiyam-data-safety/SKILL.md` v1.0 okundu; hassas veri/secret/harici aktarım yapılmadı.
Değişen dosyalar:
- Ürün kodu yok; bu ilerleme kaydı eklenmek üzere.
Test komutları ve gerçek PASS/FAIL/SKIP:
- `node --version`: PASS — v24.20.0.
- `npm --version`: PASS — 11.19.0.
- `codex --version`: PASS — codex-cli 0.165.0 (stale temp cleanup ve PATH alias uyarıları var).
- `codex mcp list`: PASS — Context7 ve UI Skills enabled görünüyor; Auth Unknown. Bu tek başına bağlantı kanıtı değildir.
- Context7 `resolve_library_id` (Expo) gerçek çağrısı: PASS — Expo SDK sonuçları döndü.
- UI Skills MCP gerçek sorgusu: BLOCKED — bu oturumdaki kullanılabilir tool envanterinde UI Skills istemcisi yok; yalnız `codex mcp list` yapılandırılmış/enabled gösteriyor.
- Expo: SKIP/UNAVAILABLE — repo kökünde package.json/Expo bağımlılığı veya `expo` komutu yok; `npm ls expo --depth=0` boş. `npx expo --version` güvenilir sürüm kanıtı üretmedi.
- typecheck/lint/test/cihaz: SKIP — ürün kodu ve scaffold yok.
- Git çalışma ağacı: FAIL — `git status --short --branch` komutu çalıştırıldı ancak `fatal: this operation must be run in a work tree` döndü.
Bağımsız review bulguları:
- Reviewer, bu sandbox'ta repo yoluna erişemedi; onun bağımsız dosya incelemesi tamamlanamadı.
- Bu görev kullanıcının verdiği `C:\Users\emrey\vardiyam` repo yolunda. Aktif sandbox yazma kökleri arasında değil; progress güncellemesi sandbox izni gerektiriyor.
Karar/risk:
- VDY-001 preflight henüz tamamlanmadı: UI Skills canlı çağrısı, Expo CLI/SDK uyumluluğu ve Git working tree durumu doğrulanmadı.
- R07 ve R12 açık; dış MCP erişimi/kimlik durumu net değil.
- Anayasa APPROVED; PRODUCT_SPEC v0.1 başlığı kurucu onayı bekliyor diyor. Açık ürün kararları çözülmedi ve kesinleştirilmedi.
NEXT ACTION:
- Repo için yazma izniyle bu kaydı tamamla; ardından UI Skills/Expo/Git doğrulamasını çöz veya BLOCKED olarak belgele. VDY-002'ye yalnız engeller ve uygun onay kapıları netleşince geç.

### 2026-11-05 — G0 / VDY-001 — BLOCKED

Branch/commit:
- Mevcut branch `main`; yeni `chore/vdy-001-codex-preflight` branch'i oluşturulmadı. `git status --short --branch` hâlâ `fatal: this operation must be run in a work tree` veriyor; bu yüzden değişiklik/branch güvenliği teyit edilemiyor.
Amaç ve kapsam:
- VDY-001 preflight'te duruldu. Anayasa APPROVED; ürün kodu yazılmadı. VDY-002'ye geçilmedi.
Gerçek alt ajanlar + rol/kanıt:
- Implementer ajanı: gerçek salt okunur ajan çağrısı tamamlandı; Node/npm/Codex/skill/MCP/Expo bulguları verdi.
- Reviewer ajanı: gerçek bağımsız salt okunur çağrı tamamlandı; repo kendi sandbox'ında erişilemezdi ve bağımsız doküman incelemesi yapamadı. Kendi tool envanterinde UI Skills aracı yok ve repo yazma izni olmadığını raporladı.
Okunan/uygulanan skill + sürüm:
- `vardiyam-task-flow` v1.0 okundu; zorunlu iki rol atandı.
- `vardiyam-data-safety` v1.0 okundu; gerçek veri/secret/prod erişimi yapılmadı.
Değişen dosyalar:
- Yalnız bu ilerleme kaydı güncellendi; uygulama dosyası değişmedi.
Test komutları ve gerçek PASS/FAIL/SKIP:
- Node v24.20.0, npm 11.19.0, Codex CLI 0.165.0 doğrulandı.
- `npm ls expo --depth=0`: PASS komut çalıştı, sonuç `(empty)`; `expo` komutu bulunamadı. Expo CLI/SDK sürümü ve uyumluluğu NOT VERIFIED.
- `codex mcp list`: Context7/UI Skills `enabled`, Auth `Unknown` olarak listelendi.
- Context7 Expo `resolve_library_id` gerçek isteği yanıt verdi (Expo SDK eşleşmeleri döndü): PASS.
- UI Skills gerçek sorgusu: BLOCKED_SKILL_UNAVAILABLE — bu oturumda ilgili MCP tool yok; sadece config/list çıktısı var.
- Her iki ajan gerçek çağrısı yapıldı; reviewer'ın repo incelemesi sandbox engeli nedeniyle kısmi.
- Git status: FAIL, worktree durumu güvenle doğrulanamadı. Typecheck/lint/test/cihaz: SKIP (scaffold yok).
Bağımsız review bulguları:
- Reviewer: Expo doğrulanmadı; UI Skills tool yok; progress değişikliği bu repo için yazma izni gerektiriyordu. Bağımsız repo incelemesi tamamlanamadı.
Karar/risk:
- VDY-001 BLOCKED: git çalışma ağacı/branch doğrulaması, UI Skills gerçek çağrısı ve Expo ortamı kanıtları eksik. R07/R12 açık.
- `PRODUCT_SPEC.md` başlığı v0.1 kurucu onayı bekliyor diyor; anayasa onayı bu ürün spesifikasyonu onayı olarak yorumlanmadı.
NEXT ACTION:
- Çalışma ağacı `git status` verebilir hale getirilsin ve etkin branch/yerel değişiklikler gözden geçirilsin; sonra UI Skills erişimi ve Expo scaffold/uyumluluğu için gerçek kanıt sağlansın. Bu blokajlar çözülmeden VDY-001 DONE veya VDY-002 START yazma.

### 2026-11-05 — G0 / VDY-001 — START (agent/tool efficiency update)

- **Kurucu talebi:** Ekli metinle her task'ta iki ajan kuralını risk bazlı R0–R3 modeline çevir; gereksiz skill/MCP bağlamını azalt; VDY-001 blokajlarını sırayla çöz.
- **Risk/kapsam:** R3 (anayasa + agent config + CLI/MCP); ürün kodu, maaş/secret/.env ve production erişimi kapsam dışı.
- **Git kanıtı:** Salt-okunur `git rev-parse` `is-inside-work-tree=true`, `is-bare-repository=false`, `core.bare=false` gösterdi; `git status` sandbox izin kısıtında hata verdi. Elevated `git --work-tree=C:\Users\emrey\vardiyam status --short --branch` `## main...origin/main` + yalnız bu dosyanın önceki preflight kaydını gösterdi. Mevcut değişiklik korunarak `chore/vdy-001-agent-orchestration` branch'i açıldı.
- **Resmî kaynaklar:** OpenAI Codex config reference `agents.default_subagent_model`, `default_subagent_reasoning_effort`, `max_concurrent_threads_per_session`, custom roles alanlarını doğruladı; GPT-6 Luna official model doc bulundu. Context7 docs CLI + skills yolu ve UI Skills CLI/skill kurulum/fetch komutları vendor dokümanından doğrulandı.
- **Kullanılan skill:** `vardiyam-task-flow` (koordinasyonlu preflight), `openai-docs` (Codex config), `context7-mcp` (CLI/docs).
- **NEXT ACTION:** Orkestrasyon dokümanlarını güncelle; Context7/UI Skills çağrılarını kurulum yapmadan önce uygun kapsamda dene.

### 2026-11-05 — G0 / VDY-001 — CHECKPOINT (Context7 auth gate)

- **Git:** Elevated read-only `git --work-tree=C:\Users\emrey\vardiyam status --short --branch` `## chore/vdy-001-agent-orchestration` + beklenen doküman değişikliklerini doğruladı. Önceki hata Git bozukluğu değil, sandbox'ın repo yoluna erişimiydi; `core.bare=false`, `is-inside-work-tree=true`.
- **CLI:** `npx --yes ctx7 docs /expo/expo "Expo SDK compatibility requirements and SDK version selection"` gerçek Expo kaynaklı sonuç döndürdü. `npx --yes ui-skills get baseline-ui` gerçek public skill içeriği döndürdü; Tailwind/web kuralları nedeniyle native Expo için uygun bulunmadı ve projeye eklenmedi.
- **Context7 setup:** `npx --yes ctx7 setup --cli --codex --project --yes` device OAuth bekliyor. Cihaz kodu yalnız geçici oturumda; git/progress içine yazılmadı. Kullanıcı yetkilendirmesi gelmeden devam edilmedi.
- **Codex config:** `codex mcp get openaiDeveloperDocs` project config'i parse etti; `codex mcp list` OpenAI Docs server'ını enabled gösterdi (CLI'nin Auth alanı `Unsupported`, bu gerçek MCP query kanıtı değildir). Global Context7 MCP listede kalır; diğer projeleri etkileyen global ayar değiştirilmedi.
- **Reviewer:** R3 reviewer, §8 ve `vardiyam-ui-quality` dosyalarında UI alt ajanını her görev için zorunlu kılan çelişkiyi; R2/R3 ayrımının belirsizliğini; NEXT ACTION/current state uyumsuzluğunu buldu. Düzeltmeler uygulanıyor.
- **NEXT ACTION (o andaki durum):** Context7 device authorization işlemini bekle; paralelde reviewer düzeltmelerini tamamla.

### 2026-11-05 — G0 / VDY-001 — DONE

- **Branch:** `chore/vdy-001-agent-orchestration`; Git sağlıklı, elevated `git status --short --branch` ile doğrulandı. Sandbox'ın normal erişim hatası repo bozukluğu değildi.
- **Anayasa/karar:** Kurucu talebiyle PROJECT_CONSTITUTION v1.1 APPROVED; ADR-012 eklendi, ADR-006 superseded işaretlendi. R0–R3 en yüksek-risk-kazanır sınırı ve ≤3 normal progress checkpoint kuralı tanımlandı.
- **Ajan:** R3 read-only reviewer iki turda §8/UI skill çelişkisini, belirsiz R2/R3 eşiğini ve current state/NEXT ACTION uyumsuzluğunu buldu. Düzeltmelerden sonra no remaining findings.
- **Skills:** Altı Vardiyam becerisi; Context7 `find-docs` setup ile indirildi. UI Skills CLI `baseline-ui` fetch edildi; web/Tailwind kapsamı native Expo için uygun görülmedi ve projeye eklenmedi. UI skill on-demand native-specific seçim kuralı içerir.
- **Config:** Python 3.12 `tomllib` ile `.codex/config.toml` parse PASS. Codex project MCP list: Context7 disabled, OpenAI Developer Docs enabled. gpt-6-luna/low, concurrency 2 ve reviewer rolleri tanımlı. Auth alanı `Unsupported`; bu query sonucu değil, config list/get kanıtıdır.
- **CLI kanıtı:** `npx ctx7 docs /expo/expo ...` PASS; `npx ctx7 setup --cli --codex --project --yes` device authorization sonrası `find-docs` skill'i kurdu. `npx ui-skills get baseline-ui` PASS (public skill içeriği). `npx --yes expo --version` PASS — 58.1.19; proje manifesti yok, hedef SDK seçilmedi.
- **Git/format:** `git diff --check` PASS. Branch/status kontrolü sandbox erişim kısıtı nedeniyle elevated komutla yapıldı.
- **Testler:** Ürün typecheck/lint/unit/device testleri SKIP; scaffold yok. Secret, `.env`, gerçek maaş veya production erişimi kullanılmadı.
- **Açık risk:** R12 dış araç telemetrisi/hesap bağlantısı incelemesi sürüyor; global Context7 MCP diğer projeleri etkilememek için silinmedi, Vardiyam'da project override ile kapatıldı.
- **NEXT ACTION:** VDY-002 scaffold; başlamadan PRODUCT_SPEC v0.1 kurucu onay durumunu netleştir ve hedef Expo SDK'yı resmi uyumlulukla sabitle.

### 2026-11-05 — G0 / VDY-001 — REOPENED (R3 review findings)

- **Reviewer:** Final kontrol, §12 R3 için uzman ajan kanıtının eksik olduğunu ve `find-docs` skill kota fallback'inin eski bilgiye izin verdiğini buldu.
- **Düzeltme:** Context7 skill fallback'i resmi canlı kaynak doğrulamasına çevrildi; AGENTS'e normal sandbox sınırlarına uyma ve doğrulanamayan API/SDK/CLI ayrıntılarını tahmin etmeme kuralı eklendi.
- **Uzman:** Dar Codex configuration specialist incelemesi başlatıldı (salt okunur; `.codex/config.toml`, Context7 setup ve veri sınırları).
- **NEXT ACTION:** Uzman bulgularını al; kalan P0/P1 yoksa final progress/task durumunu DONE yap.

### 2026-11-05 — G0 / VDY-001 — RISK RECLASSIFICATION / DONE

- **Risk düzeltmesi:** Bu iş önce temkinli biçimde R3 sınıflandırıldı. Kapsam, kullanıcı talebiyle yapılan proje-scope agent/skill/MCP varsayılanları ve belgelerle sınırlı; pay algoritması, kullanıcı verisi, secret/data export veya production security boundary değişmedi. Anayasa §12'ye bu sınır eklendi ve task **R2** olarak yeniden sınıflandı.
- **Reviewer:** Bağımsız reviewer, R2 sınıfının modele uyduğunu ve mevcut privacy/security/legal/data-loss/release kapılarının korunduğunu doğruladı. `find-docs` skill'inin stale-knowledge fallback'i resmi canlı doğrulama kuralına çevrildi.
- **Uzman ajan denemesi:** gpt-6-luna/low configuration specialist gerçek çağrısı repo dosyalarını sandbox'ında göremedi; sonuç uzman review'u sayılmadı ve hiçbir dosya değiştirmedi. R2 için uzman ajan zorunlu olmadığına reviewer ile karar verildi.
- **Durum:** VDY-001 DONE. Typecheck/lint/unit/device testleri ürün scaffold'ı olmadığından SKIP.
- **NEXT ACTION:** VDY-002 scaffold; önce Product Spec v0.1 onay durumunu netleştir ve Expo SDK'yı resmi uyumlulukla sabitle.

### 2026-11-05 — Tooling / Playwright CLI setup

- **İstek/kapsam:** Vardiyam repo'sunda ajan odaklı Playwright CLI kurulumu ve güvenli browser smoke check; ürün kodu veya üretim erişimi yok.
- **Branch:** `chore/vdy-001-agent-orchestration` (mevcut çalışma branch'i; önceki VDY-001 değişiklikleri korunmuştur).
- **Skill:** Repo-local `.agents/skills/vardiyam-task-flow/SKILL.md` ve kurulumla gelen `.agents/skills/playwright-cli/SKILL.md` okundu.
- **Kurulum kanıtı:** `npm install -g @playwright/cli@latest` başarılı; `playwright-cli --version` → `0.1.23`. `playwright-cli install --skills=agents` workspace setup ve repo-local Playwright CLI skill'ini tamamladı; `.gitignore` `.playwright-cli/` çıktısını hariç tutuyor.
- **Browser doğrulaması:** İlk Chrome açılışı crashpad hatasıyla başarısız oldu. `playwright-cli install-browser chromium --only-shell` sonrasında Playwright `1.65.0-alpha-2026-10-30` headless shell listelendi. `playwright-cli open https://example.com` başarılı (`Example Domain`); `playwright-cli close` başarılı. İlk başarısız deneme PASS sayılmadı; sonraki eşleşen headless-shell doğrulaması başarılı.
- **Testler:** Yalnız browser CLI smoke check PASS. Uygulama testleri/typecheck/lint SKIP (Expo app scaffold/manifest yok; bu işte çalıştırılmadı).
- **Güvenlik:** Yalnız herkese açık `example.com`; auth profili/secret/.env/maaş verisi/production kullanılmadı. Geçici browser kapatıldı; Playwright çıktı dizini gitignore altında.
- **Risk/limit:** Playwright CLI browser otomasyonu sağlar; native Android/iOS Expo E2E testi yerine geçmez. Uygulama scaffold'ı sonrası ayrıca test altyapısı seçilmeli.
- **NEXT ACTION:** VDY-002 öncesi Product Spec v0.1 onayını netleştir ve Expo SDK'yı resmi uyumlulukla sabitle.

### 2026-11-05 — G0 / VDY-002 pre-gate — READY FOR FOUNDER REVIEW

- **Başlangıç/branch:** `git status --short --branch` → `## chore/vdy-001-agent-orchestration`; dirty worktree'de önceki VDY-001 ve Playwright kurulum değişiklikleri vardı, korundu. `playwright-cli --version` → `0.1.23`.
- **Risk/amaç:** R2, çünkü ücret/iş kuralı ve hesaplama ürün davranışı belirleniyor. Sadece şartname/karar/QA belgeleri; Expo scaffold, ürün kodu ve anayasa değişikliği yok.
- **Gerçek ajanlar:** `vdy002_spec_implementer` PRODUCT_SPEC, DECISIONS ve QA matrisinde dar değişiklik yaptı. `vdy002_spec_reviewer` bağımsız olarak P1 (onboarding hafta sonu ve gerçek hafta tatilini birleştiriyor) ve P2 (oran test kapsamı) buldu. Düzeltmeden sonra final inceleme APPROVE, P0–P2 bulgu yok; son P23 çeviri düzeltmesini ayrıca doğruladı.
- **Skill:** `.agents/skills/vardiyam-task-flow/SKILL.md` v1.0 ve `.agents/skills/vardiyam-pay-calculation/SKILL.md` v1.0 okundu/uygulandı.
- **Değişiklikler:** PRODUCT_SPEC v0.1 hâlâ `kurucu onayı bekliyor`; ADR-013 `USER_STATED` olarak kaydedildi, `APPROVED` değil. QA matrisi P19–P34 ile istekler için planlanan kabul koşullarını genişletti. `docs/DECISIONS.md` Q1–Q3 açık kararları güncelledi.
- **Doğrulama:** İlgili dokümanlarda `git diff --check` PASS. Typecheck/lint/ürün testleri SKIP (kod/scaffold yok; çalıştırılmadı). Uygulama kabul testleri henüz planlı fixture; çalıştırılmış sayılmaz.
- **Risk/açık karar:** Kesin aylık bölen değeri, onboarding varsayılan seçimi ve çakışma varsa açık seçim/öncelik politikası belirlenmedi. Uyarı + manuel düzeltme güvenli fallback şartnamede zorunlu. Resmî oran iddiası yok; hukuk uzmanı incelemesi yayın öncesi anayasada kalır.
- **NEXT ACTION:** Kurucu, PRODUCT_SPEC v0.1'i ve açık Q1–Q3 kararlarını inceleyip açık onay versin; onay gelmeden VDY-002 Expo scaffold başlatılmayacak.

### 2026-11-05 — G0 / VDY-002 pre-gate — START

- **Amaç:** PRODUCT_SPEC v0.1'i ücret seçenekleri, işyeri aylık saat böleni, hafta sonu/gerçek hafta tatili/tatil ayrımı, çakışma davranışı ve üç ödeme türü için test edilebilir hâle getirmek; kurucu onayını açık bırakmak. Scaffold kapsam dışı.
- **Başlangıç kanıtı:** `git status --short --branch` → `## chore/vdy-001-agent-orchestration` ve mevcut VDY-001/Playwright doküman değişiklikleri; temiz değil, korunacak. `playwright-cli --version` → `0.1.23`.
- **Risk:** R2 — ücret/iş kuralı ve ödeme gösterim şartnamesi; gerçek maaş/secret/.env/prod yok. Bağımsız reviewer gereklidir.
- **Plan:** (1) Repo-local task-flow + pay skill'i uygula; (2) dar şartname ve ADR güncellemesini hazırla; (3) reviewer'dan bağımsız kabul/çelişki incelemesi al; (4) doküman tutarlılığı ve diff kontrolü; (5) kurucu onayı bekleyen v0.1 olarak kaydet.
- **Ajanlar:** İstenen gerçek implementer ve bağımsız reviewer kullanılacak; reviewer implementasyon sonrası yalnız ilgili diff ve kriterleri alacak.
- **Skill:** `.agents/skills/vardiyam-task-flow/SKILL.md` v1.0 ve `.agents/skills/vardiyam-pay-calculation/SKILL.md` v1.0 okundu.
- **Başlangıç testleri:** test suite çalıştırılmadı; şartname hazırlığı, uygulama kodu yok.

### 2026-11-05 — G0 / VDY-002 pre-gate — IMPLEMENTED / REVIEW PENDING

- **Implementer:** Gerçek `vdy002_spec_implementer` ajanı, yalnız `PRODUCT_SPEC.md`, `docs/DECISIONS.md`, `docs/QA_TEST_MATRIX.md` üzerinde çalıştı. Başlangıç şartlarını v0.1 taslağı olarak ekledi; ADR-013 `USER_STATED`, kurucu onayı bekliyor. Önceki VDY-001 değişiklikleri korunuyor.
- **Kabul kapsamı:** Opsiyonel aylık brüt/saatlik brüt/net-only/ücret yok; işyeri profilinde ayarlanan fakat varsayılan sabitlenmeyen bölen; farklı gün/tatil sınıfları; açıklamalı tek kural ve belirsizlik uyarısı/manual correction; yapılandırılabilir dönem; üç tutar türünün ayrımı/net-only'de brüt görünmemesi. QA matrisi P19–P30 eklendi.
- **Kod/scaffold:** Değişmedi; Expo scaffold başlatılmadı.
- **Doğrulama:** `git diff --check -- PRODUCT_SPEC.md docs/DECISIONS.md docs/QA_TEST_MATRIX.md` temiz (PASS). Uygulama testleri/typecheck/lint SKIP; kod yok ve bu belge görevi için çalıştırılmadı.
- **Review:** Bağımsız R2 reviewer, yalnız üç dosyanın diff'i ve talep kriterleriyle başlatıldı; sonuç bekleniyor.
