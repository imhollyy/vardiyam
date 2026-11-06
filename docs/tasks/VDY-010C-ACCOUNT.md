# VDY-010C — Hesap Ekranı ve Kod Düzeni Turu

**Dal:** `feat/vdy-account-entry-cleanup`
**Başlangıç:** PR #31 / `36e3f0f9032569a66fc52c71b80e83ad15fccfc0`
**Risk:** R2 UI ve kimlik bilgisi gizliliği.
**Kapsam:** İsteğe bağlı hesap giriş/kayıt arayüzü ve sınırlı, davranış koruyan UI tekrar temizliği.

## Kararlar ve sınırlar

- Ürünün temel kullanımı hesapsız ve çevrimdışı kalır; ilk açılışta giriş zorunlu değildir.
- E-posta, parola, Google ve Apple seçenekleri arayüzde gösterilir. Kimlik doğrulama servisi/SDK yapılandırılmadığından ağ isteği, oturum oluşturma veya kimlik bilgisi saklama yapılmaz.
- Form doğrulaması yalnızca e-posta biçimini, parolanın boş olmamasını ve kayıt sırasında tekrarın eşleşmesini denetler. Parola politikası sağlayıcı seçilince belirlenir.
- Vardiya, çalışma, kazanç, ödeme, SQLite şeması ve yedekleme davranışı değiştirilmez.

## Uygulama planı

1. Anayasa ve ürün sınırlarını, rota/tema akışını ve yerel kimlik doğrulama entegrasyonlarını incele.
2. Açıkça geçici/işlevsiz olduğunu belirten erişilebilir giriş/kayıt ekranı ekle; yerel kullanıma devam yolunu koru.
3. Ana ekran profil menüsünü ve Ayarlar bağlantısını güncelle; sahte “çıkış” davranışını kaldır.
4. Bugün, Takvim ve Çalışma ekranlarındaki yinelenen buton görsellerini ortak `ActionButton` bileşenine taşı.
5. Form doğrulamasını birim testleriyle dene; typecheck, lint, test, diff ve bağımsız UI/a11y review kapılarını çalıştır.

## Sonraki kurucu yapılandırması

- Hesap/kimlik doğrulama sağlayıcısı ve bunun yalnızca giriş mi yoksa bulut eşitleme de mi sağlayacağı.
- Sabit Android package ve iOS bundle ID'leri, OAuth redirect/deep-link alanı ve varsa web alan adı.
- Google OAuth proje/consent ekranı ve Android/iOS client ID'leri; imzalama SHA parmak izleri.
- Apple Developer Team/Services ID, Sign in with Apple capability ve anahtar/sertifika yönetimi.
- E-posta gönderici alan adı, doğrulama ve parola sıfırlama şablonları/redirect'leri, hesap silme ve oturum politikası.
- Parola kuralları, rate limit/abuse önlemleri, staging/prod ortam ayrımı ve gizli değerlerin güvenli dağıtımı.
- Yerel SQLite verisinin hesaba bağlanma veya buluta taşınma onayı, eşitleme/çakışma politikası, sunucu bölgesi, saklama/silme ve yedekten geri getirme davranışı.
- Kullanıcıya gösterilecek gizlilik/KVKK açıklaması, hesap verisi işleme amacı ve silme/dışa aktarma yolu; son metin için uzman incelemesi.

## Genel tarama sınırı

Bu tur UI tekrarları ve statik kod işaretleriyle sınırlıdır. Tam dosya-bazlı yeniden yapılandırma, çalışma zamanı profilleme ve cihaz ekran okuyucu kabulü yapılmaz. Uzun ekran dosyaları rapor edilir; iş akışı riski nedeniyle bu görevde bölünmez.

## Sonuç — 2026-11-06

- E-posta giriş/kayıt, Google/Apple CTA'ları, alan doğrulaması/parola görünürlüğü ve misafir dönüşü hazır. Gerçek auth entegrasyonu bilinçli olarak beklemede.
- Today, Calendar ve WorkRecords'teki yinelenen yerel Button uygulamaları paylaşılan `ActionButton` ile değiştirildi; koyu tema başarı/hata metin kontrastı `mode` ile belirleniyor.
- `npm run typecheck` PASS; `npm run lint` PASS; `npm test` PASS **278/278**; `git diff --check` PASS. Form doğrulamasına iki yeni test eklendi.
- Bağımsız R2 UI/a11y reviewer: ilk turdaki takvim çağrısı, doğrulama ve koyu tema kontrastı bulguları düzeltildi; final **APPROVE**, açık P0/P1/P2 yok.
- Expo Doctor/JS export, gerçek cihaz, TalkBack/VoiceOver ve GitHub CI bu turda çalıştırılmadı. R13 kapsamında bilinen 12 moderate npm advisory değişmedi.
- Taslak PR #32 (`feat/vdy-account-entry-cleanup` → `feat/vdy-010c-product-ux-polish`); implementation commit `bb89b96bb4e39f47793649d9806c2ceb434a318f`. GitHub Actions CI run #44 PASS. Merge/release yok.
