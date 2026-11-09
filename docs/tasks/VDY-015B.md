# VDY-015B — Kolay vardiya kurulumu ve 30 günlük önizleme

**Issue:** [#41](https://github.com/imhollyy/vardiyam/issues/41)
**Branch:** `feat/vdy-015b-easy-shift-onboarding`
**Base:** PR #39 head `d58ab0d1c49b1cde4013fe70e01c01988d3e6445`
**Risk:** R2 — mevcut kullanıcı vardiya ayarı/verisi etkilenebilir; bağımsız UI ve data-safety review zorunlu.

## Amaç

Kullanıcı, sade adımlarla vardiya düzeni ve saatlerini seçer, başlangıç tarih/fazını belirler, gelecek 30 gerçek günü görür ve yalnız açık onayda mevcut shift-cycle repository'si üzerinden kaydeder. Vardiya motoru yeniden yazılmaz. Ücret seçimi isteğe bağlıdır.

## Kabul kriterleri

- `fixed` her takvim günü için vardiya üretir; hafta içi düzeni gibi sunulmaz. Desteklenmeyen hafta içi/hafta sonu döngüsü yanlış map edilmez.
- Sabit ve 4+2/6+1 için yalnız kullanılan şablon saatleri; haftalık üçlü ve 2+2+2 için üç saat grubu; custom için kullanılan şablonlar gösterilir.
- Native time/date picker, gece yarısı açıklaması, başlangıç günü ve başlangıç cycle phase'i (custom OFF dahil) çalışır.
- Takvim motoru `previewShiftSchedule` ile tam 30 ardışık yerel günü üretir; ay/yıl geçişi doğru, preview shift tablolarına yazmaz.
- Önizleme öncesi vardiya cycle kaydı yoktur. Kaydetme yalnız açık onayla, aynı cycle kimliğini koruyarak ve repository transaction'ı içinde olur; hızlı çift tetikleme mükerrer cycle yaratmaz.
- Başarısız kayıt eski cycle/template/override/WorkRecord/snapshot/ödeme verisini korur. Önceden kayıtlı template kimlikleri değiştirilmez. Pattern adı saklı değilse yüklenen dizinin gerçek yapısı kullanılır; kesin pattern adı uydurulmaz.
- Mevcut cycle değişikliği geçmiş plan günlerini etkileyebilecekse kullanıcıya bu etki kaydetmeden önce gösterilir/onayı alınır. WorkRecord ve snapshot'lara dokunulmaz.
- Kurulum yeniden açılınca kayıtlı cycle, template saatleri, başlangıç tarihi ve özel OFF fazı yüklenir; mevcut ücret profili korunur. Ücret adımını atlama profile yazmaz.
- Her adım/çalışma taslağı kapanıp açıldığında korunur; hata/loading/saving/empty durumu, light/dark, küçük ekran, büyük metin ve ekran okuyucu labels/states desteklenir.
- Mevcut testler korunur. Typecheck, lint, full tests, Expo Doctor, Android/iOS Hermes export ve GitHub CI çalıştırılır. Gerçek cihaz kabulü yapılmazsa NOT RUN kaydedilir.

## Sınırlar

Günlük/toplu WorkRecord onayı, yıllık izin bakiyesi, ücret geçmişi, çoklu işyeri, cloud sync, reklam/Pro, ana ekran redesign, migration değişikliği ve iOS Kazanç runtime hatasının cihaz doğrulaması bu görevde yoktur.

## İlerleme

- Başlangıçta PR #39 head, branch ve dirty worktree doğrulanacak; source worktree kullanıcı değişiklikleri korunacak.
- Yedi adım: karşılama, düzen seçimi, vardiya saatleri, başlangıç tarihi/fazı, 30 günlük önizleme, isteğe bağlı ücret, tamamlama. Düzen taslağı ve adım `app_metadata` transaction kuyruğu ile kalıcı; önizleme yalnız VDY-003A motorunu çağıran pure projection. Açık onay dışında shift cycle/template kaydı yapılmıyor.
- Kayıtlı düzen, template ve cycle ID'leriyle geri yükleniyor. Özgün pattern adı saklı değilse gerçek giriş dizisi özel düzen olarak gösteriliyor. Geçmiş projeksiyonu değişebilecekse onay uyarısı var. WorkRecord, onaylı snapshot, payment ve backup tabloları bu akışta değiştirilmedi.
- Ücret adımını atlama profili yazmıyor; mevcut ücret profili açılışta yükleniyor. Mevcut ücret girişleri değiştirilmeden “Kaydet” seçilirse gereksiz profil sürümü eklenmiyor.
- **Kod:** `app/onboarding.tsx`, `src/features/onboarding/scheduleDraft.ts`, `src/features/shifts/schedule.ts`, `src/data/appPreferencesRepository.ts`; repository/domain regressions eklendi. Migration veya paket değişikliği yok.
- **Doğrulama:** `npm run typecheck` PASS; `npm run lint` PASS; `npm test` PASS **305/305**; `git diff --check` PASS. Android Hermes export PASS (1311 modül, 3.5 MB); iOS Hermes export PASS (1309 modül, 3.5 MB). Expo Doctor **18/20**; iki kontrol `exp.host` ve React Native Directory metadata için ağ/DNS başarısızlığı (ENOTFOUND/server response), yerel kontroller geçti. `npm ci` DNS nedeniyle kullanılamadı; kilit dosyası değişmedi ve aynı lockfile içeriğine ait mevcut node_modules kopyası doğrulama için kullanıldı.
- **Bağımsız review:** UI reviewer P2 40 px seçim hedefini buldu; 44 px’e düzeltildi ve reviewer re-check’te P0/P1/P2 yok (P3: çok uzun template adı görsel olarak kısalabilir; tam erişilebilir etiketi korunur). Veri reviewer P2 bozuk baseline metadata doğrulamasını buldu; domain validator’ları ve fail-safe rehydrate yolu eklendi, malformed kayıt regressions eklendi; re-review APPROVE, P0/P1/P2 yok. UI, veri ve test becerileri ana ajan tarafından okundu/uygulandı; Pro Max yerel arama sonuçları ve sorgu kapsamı önceki başlangıç checkpoint’inde kayıtlı.
- **Cihaz/CI:** Android/iOS gerçek cihaz, büyük metin, TalkBack/VoiceOver, ekran görüntüsü ve kullanıcı kabul turu **NOT RUN**. GitHub Actions CI PR açıldıktan sonra kontrol edilecek.
- **Koruma:** Kaynak worktree kullanıcı dosyaları değiştirilmedi. `docs/tasks/VDY-015A-product-flow-analysis.md` ayrı worktree’de korunuyor ve seçili commit’e alınmayacak.
- **NEXT ACTION:** Taslak PR ve CI kanıtını tamamla; iPhone/Expo Go kabulinden önce VDY-015C’ye başlama.
