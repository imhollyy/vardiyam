# Vardiyam

Türkiye'deki fabrika ve üretim çalışanları için kişisel vardiya, fiilî çalışma, fazla mesai ve kazanç takibi.

> Durum: Proje başlangıcı. Henüz uygulama kodu yoktur. Ürün anayasası ve ilk geliştirme kapsamı kurucu incelemesinden geçecektir.

## Ürün ilkeleri

- **Offline-first:** Hesap açmadan ve sunucu gerektirmeden temel kullanım.
- **Plan / gerçek ayrımı:** Planlanan vardiya ile fiilen çalışılan süre farklı kayıtlardır.
- **Açıklanabilir kazanç:** İşyeri kuralları özelleştirilebilir; tahmini brüt, bordro neti ve gerçekten alınan ödeme ayrı tutulur.
- **Güvenli geçmiş:** Kural veya ücret değişikliği geçmiş hesapları sessizce değiştirmez.
- **Kaliteli deneyim:** Hızlı, sade, erişilebilir Android ve iOS arayüzü.
- **Önce güvenilir MVP:** Tam bordro ve hukuki uygunluk garantisi verilmez.

## Geliştirme

Teknik hedef: React Native + Expo + TypeScript + SQLite. Mimari ve ayrıntılı kapsam, öneri aşamasındaki `PROJECT_CONSTITUTION.md` ile yönetilir.

Codex ve diğer ajanlar işe başlamadan önce `AGENTS.md` ve `docs/progress/PROGRESS.md` dosyalarını okumalıdır. Tam Kare'deki disiplin uyarlanır; çok kiracılı SaaS ve Supabase zorunlulukları bu projeye taşınmaz.

**Güvenlik:** Bu depo herkese açıktır. Gerçek maaş, bordro, kimlik, erişim anahtarı ve kişisel veri commit edilmez.
