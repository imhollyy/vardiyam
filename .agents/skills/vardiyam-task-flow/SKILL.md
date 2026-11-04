---
name: vardiyam-task-flow
description: Vardiyam deposundaki her geliştirme, belge, hata düzeltme ve inceleme görevini alt ajan, kanıt ve kalıcı ilerleme günlüğüyle yürütmek için kullanılır.
---

# Vardiyam Task Flow — v1.0

**Her task için zorunlu.** Önce `AGENTS.md`, `PROJECT_CONSTITUTION.md`, `docs/progress/PROGRESS.md` ve ilgili görev belgesini oku.

1. `git status --short` ile mevcut değişiklikleri kontrol et. Onaysız anayasa değişikliği yapma.
2. Task ID, kapsam dışı, kabul kriterleri, etkilenebilecek dosyalar, risk ve 3–7 maddelik plan belirle.
3. **Gerçek** uygulayıcı ve bağımsız reviewer alt ajanı görevlendir; reviewer uygulayıcının sonucunu kendi incelemesiyle doğrulasın. Gerekiyorsa hesap, güvenlik veya UX uzmanı ekle. Ortamda alt ajan yoksa `BLOCKED_AGENT_UNAVAILABLE` yaz ve onay iste.
4. Göreve uygun ikinci beceriyi seç: hesap için `vardiyam-pay-calculation`, UI için `vardiyam-ui-quality`, veri güvenliği için `vardiyam-data-safety`. Beceri dosyasını gerçekten açmadan kullanıldı deme.
5. `docs/progress/PROGRESS.md` START kaydı aç. Her anlamlı checkpoint'te güncelle.
6. Dar kapsamlı uygula; unit/integration/cihaz testlerini etkisine göre **gerçekten** çalıştır.
7. Reviewer'dan diff, acceptance, regressions, privacy ve veri kaybı riskleri için yazılı değerlendirme al.
8. `docs/progress/PROGRESS.md` içinde PASS/FAIL/SKIP, kanıt, review bulguları, commit/PR, risk ve **NEXT ACTION** kaydet.
9. Kurucu onayı gereken değişiklikte dur; `main`e push, merge, release yapma.

**Çıktı sözleşmesi:** `TASK | STATE | IMPLEMENTER | REVIEWER | SKILLS | FILES | TEST EVIDENCE | RISKS | NEXT ACTION`.

Ajan rolü taklidi gerçek alt ajan çalıştırılması değildir. Testin mevcut olmaması PASS değildir. Kaynak kodunu harici hizmete aktaran skill/MCP öncesi kullanıcı onayı ve veri paylaşımı kontrolü zorunludur.
