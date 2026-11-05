---
name: vardiyam-task-flow
description: Use for multi-file behavioral tasks, coordinated preflight, or release work; choose risk, one relevant skill, minimal verification, and progress evidence.
---

# Vardiyam Task Flow — v1.0

**R1+ çok dosyalı/davranış değiştiren görevler, preflight ve release için.** Önce `AGENTS.md`, progress'teki aktif task/NEXT ACTION ve ilgili task belgesini oku. Anayasa veya ürün kararını etkiliyorsa ilgili bölümü aç.

1. `git status --short` ile mevcut değişiklikleri kontrol et. Onaysız anayasa değişikliği yapma.
2. Task ID, kapsam dışı, kabul kriterleri, etkilenebilecek dosyalar, risk ve 3–7 maddelik plan belirle.
3. Risk sınıfını belirle. R0'da subagent kullanma; R1'de gerekmedikçe spawn etme; R2'de gerçek bağımsız reviewer, R3'te reviewer ve gerekçeli uzman kullan. Reviewer'a yalnız dar diff ve acceptance ver.
4. Göreve uygun tek uzmanlık becerisini seç: hesap, UI, veri güvenliği, test veya release. Skill dosyasını gerçekten açmadan kullanıldı deme.
5. `docs/progress/PROGRESS.md` başlangıç, önemli karar/blokaj ve bitişte güncelle; olağan task'ta en fazla üç kayıt tut.
6. Dar kapsamlı uygula; unit/integration/cihaz testlerini etkisine göre **gerçekten** çalıştır.
7. Risk seviyesi reviewer gerektiriyorsa diff, acceptance, regression, privacy/veri kaybı riskleri için yazılı bağımsız değerlendirme al.
8. `docs/progress/PROGRESS.md` içinde PASS/FAIL/SKIP, kanıt, review bulguları, commit/PR, risk ve **NEXT ACTION** kaydet.
9. Kurucu onayı gereken değişiklikte dur; `main`e push, merge, release yapma.

**Çıktı sözleşmesi:** `TASK | STATE | AGENT PLAN/RESULT (including none + reason) | SKILLS | FILES | TEST EVIDENCE | REVIEW (if risk requires) | RISKS | NEXT ACTION`.

Ajan rolü taklidi gerçek alt ajan çalıştırılması değildir. Testin mevcut olmaması PASS değildir. Kaynak kodunu harici hizmete aktaran skill/MCP öncesi kullanıcı onayı ve veri paylaşımı kontrolü zorunludur.
