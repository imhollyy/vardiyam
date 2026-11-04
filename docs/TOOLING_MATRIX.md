# Vardiyam — Codex Araç ve Beceri Envanteri v0.1

**Durum tarihi:** 2026-11-05. `enabled` / yapılandırılmış olmak **gerçek araç çağrısı PASS** değildir. Yerel Windows Codex oturumunun raporu esas alınır. Tam Kare'deki belgeler incelendi; özel depodan kaynak kodu veya gizli ayar kopyalanmadı.

| Araç / beceri | Öncelik | Gözlenen durum | Vardiyam kullanımı / kapı |
|---|---|---|---|
| **Repo-local 4 skill** (`vardiyam-task-flow`, `pay-calculation`, `ui-quality`, `data-safety`) | Zorunlu, göreve göre | Dördü keşfedilmiş; task-flow ve data-safety okunmuş | Her task'ta task-flow + ilgili uzman skill |
| **Düşük maliyet ajan politikası** | Zorunlu | Bu PR ile önerildi | 1 implementer + 1 bağımsız reviewer; başka ajan gerekçeli |
| **Context7 MCP** | API/sürüm belirsizliği | `enabled`, gerçek Expo doküman sorgusu **PASS** (kullanıcı Codex raporu) | Paket sürümünü resmi docs ve yerel testle doğrula |
| **UI Skills MCP** | UI görevinde | `enabled`, **gerçek çağrı NOT VERIFIED** | `list_skills` + `get_skill` veya onaylı CLI; RN uyarlaması |
| **Graphify** | Belirsiz, opsiyonel | **Tam Kare varsayılan repo araçlarında bulunamadı; sağlayıcı/ürün kimliği NOT VERIFIED** | Kurulum yok; resmi repo, yetkiler, kaynak paylaşımı, fiyat ve MCP endpoint doğrulansın |
| **GitHub** | Kod/PR | Bağlantı çalışıyor | Branch/PR; main'e merge için kurucu onayı |
| **Node/npm/Codex CLI** | Zorunlu | Node 24.20.0 / npm 11.19.0 / Codex 0.165.0 (kullanıcı raporu) | Yerelde yeniden doğrula |
| **Expo** | VDY-002 | `npm ls expo --depth=0` boş; **scaffold yokken beklenen** | VDY-002'de uyumlu Expo SDK'yı kur; önceden kurulu şart değil |
| **Playwright** | İhtiyaca göre | Tam Kare'de web smoke var; Vardiyam'da NOT INSTALLED | Sadece web yüzeyi açılırsa; native cihaz testinin yerine geçmez |
| **Gitleaks** | Önerilen | Vardiyam yerelde NOT VERIFIED | Public repo için secret taraması; kurulum/CI maliyetini değerlendir |
| **Strix** | Ertele / manuel | Tam Kare'de manuel opt-in; Vardiyam'da NOT INSTALLED | Kaynak paylaşımı, model, bütçe, onay olmadan çalıştırma |
| **Expo Doctor** | VDY-002 sonrası | NOT INSTALLED | `npx expo-doctor` (kurulum ve sürüm sonrası) |
| **Jest veya Vitest** | VDY-002 | NOT INSTALLED | Domain için hızlı unit test; framework Expo uyumuyla seçilir |
| **GitHub Actions** | VDY-002 | NOT CONFIGURED | typecheck, lint, unit test, secret kontrolü; limitleri gözle |

## Tam Kare'den alınan dersler

- **Context7 ve UI Skills** proje-scope MCP; Tam Kare'de gerçek sorgu yapılmış, Vardiyam'da her araç ayrıca doğrulanmalı.
- **Playwright** yalnız browser/web smoke; **Strix** kaynak ve LLM paylaşımı yüzünden otomatik veya maliyetsiz değil.
- **Gitleaks** düşük riskli secret hygiene için yararlı; ücretli taramayı ve tüm kalite araçlarını ilk gün kurmak gereksiz.
- **Graphify** için Tam Kare'nin `AGENTS.md`, `.codex/config.toml`, `docs/development-quality-tooling.md` dosyalarında kayıt yok. Aynı isimde farklı ürünler olabilir; **uydurma URL, paket veya MCP sunucusu eklenmez**.

## Kurulum sırası

1. **GIT FIX:** `docs/LOCAL_GIT_RECOVERY.md` ile worktree'yi düzelt, yerel `PROGRESS.md` değişikliklerini koru.
2. **AGENT FIX:** İki gerçek alt ajan; reviewer repo erişimi veya PATCH_ONLY_REVIEW kanıtı; düşük maliyetli routing.
3. **MCP:** Context7 sorgusu zaten PASS; UI Skills için gerçek `list_skills/get_skill` veya kontrollü CLI test.
4. **Graphify discovery:** Kullanıcı kastettiği ürünü doğrular veya resmi kaynak bulunur; fiyat/izin analizi sonrası onay.
5. **SCAFFOLD:** VDY-002 Expo + TypeScript + SQLite + test/CI; ardından Expo Doctor.
6. **Opsiyonel:** Gitleaks/Playwright/Strix yalnız ihtiyaç ve risk durumunda.

**Güvenlik:** `npx` internetten kod indirebilir; onay ve paket doğrulaması olmadan `npx ... start` otomatik çalıştırma. Dış MCP'ye gerçek maaş, özel repo içeriği, token veya üretim verisi gönderme.
