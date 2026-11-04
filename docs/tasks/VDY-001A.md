# VDY-001A — Git worktree kurtarma + ekonomik ajan ve araç preflight

**Durum:** WAITING_FOR_LOCAL_EXECUTION
**Kapsam:** Kullanıcının 2026-11-05 VDY-001 BLOCKED raporunu çözmek. Ürün kodu yazılmaz.
**Beceriler:** `vardiyam-task-flow` + `vardiyam-tooling-preflight`
**Referans:** `docs/AGENT_COST_POLICY.md`, `docs/TOOLING_MATRIX.md`, `docs/LOCAL_GIT_RECOVERY.md`

## İş sırası

1. Windows `C:\Users\emrey\vardiyam` içinde salt-okunur Git teşhisi; `PROGRESS.md` ve yerel değişiklikleri koru.
2. `git status` PASS olmadan branch/scaffold/install yapma. Bare/bozuksa ayrı `vardiyam-clean` clone ile kurtar.
3. İki gerçek alt ajanı en düşük makul maliyetle çağır: uygulayıcı + bağımsız reviewer. Reviewer sandbox erişimini test et; gerekirse gerçek patch-only review.
4. Context7 Expo sorgusu önceki oturumda PASS; tekrarı gereksizse kaydı koru. UI Skills `list_skills/get_skill` veya güvenli CLI için gerçek test kanıtı.
5. Graphify'ı doğrulanana kadar kurma; Tam Kare'de bulunan diğer araçları Vardiyam'a kör kopyalama.
6. Kullanıcıdan harici CLI/MCP kurulum izni gerekiyorsa bekle; maliyetli tarama çalıştırma.
7. `PROGRESS.md` içine kanıtları, maliyet gözlemlerini, reviewer ve NEXT ACTION kaydet.

## Kabul kriterleri

- `git status --short --branch` PASS; `is-inside-work-tree=true`, `is-bare-repository=false`.
- Yerel kullanıcı değişiklikleri korunmuş.
- Gerçek implementer + bağımsız reviewer; reviewer'ın inceleme kapsamı dürüstçe belirtilmiş.
- UI Skills gerçekten doğrulanmış veya engel açık.
- Graphify belirsizliği belgelenmiş; izinsiz kurulum yok.
- VDY-002'ye geçiş için somut READY/BLOCKED kararı.

**Dış sınır:** main push/merge yok, Expo scaffold yok, üretim verisi yok, gereksiz üçüncü ajan yok.
