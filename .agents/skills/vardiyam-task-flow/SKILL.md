---
name: vardiyam-task-flow
description: Vardiyam deposundaki her geliştirme, belge, hata düzeltme ve inceleme görevini alt ajan, kanıt ve kalıcı ilerleme günlüğüyle yürütmek için kullanılır.
---

# Vardiyam Task Flow — v1.1

**Her task için zorunlu.** Önce `AGENTS.md`, `PROJECT_CONSTITUTION.md`, `docs/progress/PROGRESS.md` ve ilgili görev belgesini oku.

1. `git rev-parse --is-inside-work-tree` ve `git status --short --branch` ile worktree'yi ve mevcut değişiklikleri kontrol et. Git hatasında `docs/LOCAL_GIT_RECOVERY.md` rehberini uygula, yerel PROGRESS'i koru. Onaysız anayasa değişikliği yapma.
2. Task ID, kapsam dışı, kabul kriterleri, etkilenebilecek dosyalar, risk ve 3–7 maddelik plan belirle.
3. **Gerçek** 1 uygulayıcı ve 1 bağımsız reviewer alt ajanı görevlendir. Başka ajanı yalnız P0/P1 risk ve gerekçeyle aç; `docs/AGENT_COST_POLICY.md` içindeki tek uygulama/tek review ve kısa bağlam ilkesini uygula. Reviewer repo göremiyorsa redakte patch ile `PATCH_ONLY_REVIEW` yapılabilir; patch de yoksa `BLOCKED_REVIEW_UNAVAILABLE`. Alt ajan yoksa `BLOCKED_AGENT_UNAVAILABLE` yaz.
4. Göreve uygun ikinci beceriyi seç: hesap için `vardiyam-pay-calculation`, UI için `vardiyam-ui-quality`, veri güvenliği için `vardiyam-data-safety`, Git/MCP/ajan preflight için `vardiyam-tooling-preflight`. Beceri dosyasını gerçekten açmadan kullanıldı deme.
5. `docs/progress/PROGRESS.md` START kaydı aç. Her anlamlı checkpoint'te güncelle.
6. Dar kapsamlı uygula; unit/integration/cihaz testlerini etkisine göre **gerçekten** çalıştır.
7. Reviewer'dan diff, acceptance, regressions, privacy ve veri kaybı riskleri için yazılı değerlendirme al.
8. `docs/progress/PROGRESS.md` içinde PASS/FAIL/SKIP, kanıt, review bulguları, commit/PR, risk, gerçek alt ajan/MCP çağrı sayıları ve **NEXT ACTION** kaydet.
9. Kurucu onayı gereken değişiklikte dur; `main`e push, merge, release yapma.

**Çıktı sözleşmesi:** `TASK | STATE | IMPLEMENTER | REVIEWER | SKILLS | FILES | TEST EVIDENCE | RISKS | NEXT ACTION`.

Ajan rolü taklidi gerçek alt ajan çalıştırılması değildir. Testin mevcut olmaması PASS değildir. Kaynak kodunu harici hizmete aktaran skill/MCP öncesi kullanıcı onayı ve veri paylaşımı kontrolü zorunludur.
