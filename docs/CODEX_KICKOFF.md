# Codex'e ilk verilecek istem — Vardiyam

Bu istemi **yerel Codex'te `vardiyam` checkout'u açıkken** kullan. GitHub connector erişimi, yerel terminal çalıştırma yetkisi değildir.

## İstem

```text
Vardiyam projesine başlıyoruz. Önce README.md, PROJECT_CONSTITUTION.md,
AGENTS.md, PRODUCT_SPEC.md, ROADMAP.md, docs/progress/PROGRESS.md,
docs/DECISIONS.md, docs/RISKS.md, docs/tasks/VDY-001.md dosyalarını oku.

Tam Kare'deki çalışma düzeni Vardiyam'a uyarlanmıştır. Her görevde
gerçek alt ajanlar (uygulayıcı + bağımsız reviewer) ve repo-local
skill'ler zorunlu. Önce .agents/skills/vardiyam-task-flow/SKILL.md
dosyasını gerçekten oku; göreve göre ek skill kullan.

Önce yalnız VDY-001 preflight yap. Anayasa henüz APPROVED değilse ürün
koduna geçme. Codex alt ajan desteğini, skill keşfini, Context7/UI Skills
MCP bağlantısını ve yerel Node/npm/Expo ortamını gerçek komutlarla
doğrula. Kullanıcı onayı gerektiren durumlarda dur.

Her adımda docs/progress/PROGRESS.md dosyasını güncelle.
Başarısız/çalıştırılmamış testleri PASS yazma.
Gerçek maaş verisi, secret, .env veya production erişimi kullanma.
main'e push, PR merge veya release yapma.

Bitirirken TASK/branch/ajan/skill/kanıt/test/risk/NEXT ACTION raporu ver.
```

## Yerel çalışma

```bash
git clone https://github.com/imhollyy/vardiyam.git
cd vardiyam
git status --short
# PR onaylandıktan sonra güncel ana branch'i çek:
git pull --ff-only
# Codex'i bu klasörde aç; önce VDY-001'i çalıştır.
```

**Önemli:** Anayasa PR'ı merge edilmeden main'de dosyalar görünmez; Codex'i önce PR branch'inde çalıştıracaksan `git fetch origin docs/constitution-v1-and-codex-harness` ve `git switch docs/constitution-v1-and-codex-harness` kullan. Var olan yerel değişiklikleri kontrol etmeden branch değiştirme.
