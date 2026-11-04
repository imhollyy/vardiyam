---
name: vardiyam-tooling-preflight
description: Codex Git worktree, düşük kredi çok-ajan routing, Context7/UI Skills/Graphify MCP ve diğer geliştirme araçlarının güvenli kurulum/doğrulama görevlerinde kullanılır.
---

# Vardiyam Tooling Preflight — v1.0

**Görev:** VDY-001 / VDY-001A veya MCP/skill/agent düzeni değişiyorsa oku. Ana beceri `vardiyam-task-flow` ile birlikte kullan.

1. `PROJECT_CONSTITUTION.md`, `AGENTS.md`, `docs/AGENT_COST_POLICY.md`, `docs/TOOLING_MATRIX.md`, `docs/LOCAL_GIT_RECOVERY.md` oku.
2. `git rev-parse --is-inside-work-tree` ve `git status --short --branch` gerçekten çalışmadan branch açma, npm kurma, repo dosyası değiştirme.
3. Yerel `PROGRESS.md` değişikliklerini koru; yeni checkout gerekiyorsa ayrı dizin.
4. **Gerçek iki alt ajan**: implementer ve bağımsız reviewer; reviewer repo erişimi başarısızsa redakte patch ile gerçek bağımsız review; aksi hâlde BLOCKED.
5. Context7: `enabled` değil, gerçek sürüm hedefli sorgu kanıtı. UI Skills: `list_skills` + `get_skill` veya kullanıcı onaylı CLI testi. Araç yoksa NOT VERIFIED.
6. Graphify: hangi ürün olduğu, resmi kaynak, sürüm, izinler, maliyet ve kaynak kodu paylaşımı doğrulanmadan ekleme. Tam Kare'de bulunduğunu varsayma.
7. Expo kurulumu VDY-002; preflight'ta yalnız sürüm/ortam uyumluluğunu kontrol et.
8. Ağdan kod indiren `npx`, installer, yeni MCP veya dış LLM veri aktarımı için kullanıcı onayı ve güvenlik kontrolü iste.
9. `docs/progress/PROGRESS.md` içine gerçek komut çıktısı, agent/MCP çağrı sayısı, PASS/FAIL/SKIP, reviewer kanıtı, risk ve NEXT ACTION yaz.
10. Sadece kullanıcı açıkça onaylarsa `main`e merge veya production release.

**Maliyet ilkesi:** iki alt ajan, tek implementasyon ve tek review turu; üçüncü ajan ve ağır tarama yalnız gerekçeli.
