# VARDİYAM — PROJE ANAYASASI v1.1

> **Durum: APPROVED — v1.0 kurucu onayı 2026-11-05; ajan/skill orkestrasyonu v1.1 kurucu talebiyle 2026-11-05 tarihinde onaylandı.** Bu anayasa bağlayıcıdır; sonraki değişiklikler ayrı karar ve kurucu onayı gerektirir. Bölüm 14'teki açık kararlar henüz kesinleşmemiştir.
> **Öncelik:** Kurucunun açık kararı > onaylanmış bu anayasa > AGENTS.md > PRODUCT_SPEC.md > görev belgeleri. Hukuk, mağaza kuralları ve güvenlik yükümlülükleri bu sırayla bertaraf edilemez.
> **Köken:** Tam Kare deposundaki PROJECT_CONSTITUTION.md v2.2, AGENTS.md ve Development Quality Tooling disiplininden **uyarlanmıştır**. Tam Kare'nin Supabase, RLS, çok kiracılı SaaS, web ve sektör modülü zorunlulukları **aktarılmamıştır**.

## 1. Misyon ve hedef kullanıcı

Vardiyam, Türkiye'deki fabrika/üretim vardiyalı çalışanlarının **planlanan vardiyasını, fiilî çalışma süresini, mesai türlerini, tahmini brüt hakedişini ve gerçekten eline geçen net ödemeyi** tek bir güvenilir kişisel defterde izlemesini sağlar. Bordro düzenleyicisi, işveren muhasebe sistemi, hukuki danışman veya kesin net ücret hesaplayıcısı değildir.

Birinci hedef: üç vardiyalı, dönüşümlü, 8/12 saatlik, gece çalışan, hafta tatili değişen ve maaş/bordro dönemini takip etmek isteyen fabrika işçisi. Türkçe ilk dil; Android ve iOS eşit öncelikli.

**Başarı ölçüsü:** 3–4 adımda kurulum; 30 saniyede fiilî çalışma/mesai ekleme; bir tutarın hangi saat, temel ücret ve katsayıyla hesaplandığının tek dokunuşla görülebilmesi; veri kaybı ve kritik hesap hatası olmaması.

## 2. Kesin ürün ilkeleri

1. **Plan ≠ gerçekleşen:** PlannedShift, WorkRecord'dan ayrıdır; birinin düzenlenmesi diğerini sessizce değiştirmez.
2. **Yasal kural ≠ işyeri ödeme politikası:** Mevzuat referansı, işyerinin fiilî ücret uygulaması ve kullanıcının özel ayarı ayrı alanlardır.
3. **Açıklanabilir hesap:** Her kalem için süre × saatlik baz × ücret katsayısı, ücretin maaşa dahil olup olmadığı ve uygulanan kural sürümü gösterilir.
4. **Kural sürümleme:** Ücret ve katsayı değişiklikleri geçmişte onaylanmış hesapları kendiliğinden yeniden yazmaz; isteğe bağlı yeniden hesaplama fark önizlemesiyle yapılır.
5. **Çakışma güvenliği:** Aynı dakika iki kez sayılmaz; tatil/hafta tatili/fazla çalışma çakışması açık öncelik politikasıyla değerlendirilir, belirsizlik uyarısı verir.
6. **Brüt ≠ bordro neti ≠ alınan ödeme:** Bu üç veri tipi aynı kartta yanlış karşılaştırılmaz. Gerçek net ödeme kullanıcı tarafından elle girilebilir.
7. **Offline-first:** Temel kullanım için giriş, ağ veya ücretli sunucu zorunlu değildir.
8. **Kullanıcı veri sahibi:** Ücretsiz yerel yedekleme, geri yükleme ve veriyi silme hakkı; dışa aktarmada hassas veri uyarısı.
9. **Görsel kalite fonksiyondur:** Sade, premium, hızlı, okunaklı, erişilebilir; ilk sürümden itibaren light/dark ve tüm ekran durumları.
10. **Kapsam disiplini:** Önce güvenilir MVP; bulut, ekip yönetimi ve tam vergi/SGK bordrosu ilk sürüm dışında.
11. **Kanıtsız tamamlandı yok:** Çalıştırılmamış test PASS olarak yazılamaz.
12. **Onay kapıları:** Anayasa değişikliği, ücret politikası varsayılanlarının değişimi, harici veri aktarımı ve production release kurucu onayı gerektirir.

## 3. MVP — mutlaka yapılacaklar

- Hesapsız ilk açılış; işyeri profili; aylık/saatlik ücret tercihi; ücret girmeyi atlayabilme.
- 3 vardiya, sabit vardiya, haftalık rotasyon, 2+2+2, 4+2, 6+1 ve kullanıcı tanımlı vardiya döngüleri. 8/12 saat vardiya şablonları, molalar, gece yarısı aşımı.
- Bugün, Takvim, Kazanç, Ayarlar olmak üzere **4 sekme**. Tek güne vardiya değişikliği, izin/rapor/tatil ve planlanandan farklı çalışma kaydı.
- Fiilî başlangıç/bitiş, ara dinlenme, normal çalışma, fazla sürelerle çalışma, fazla çalışma, hafta tatili, resmî/genel tatil ve kullanıcı tanımlı özel gün.
- Başlangıç **işyeri varsayılanları**: normal fazla mesai **+%50 (1,50×)**; hafta sonu/işyeri hafta tatili **+%100 (2,00×)**; özel gün **+%100 (2,00×)**. Her biri bağımsız değiştirilebilir; cumartesi/pazar otomatik yasal hafta tatili değildir.
- Sözleşme haftalık süresi, gerçek hafta tatili düzeni, aylık/saatlik temel ücret, bordro/çalışma/ödeme dönemi ayarları.
- Türkiye resmî tatilleri için yerel, kaynaklı ve sürümlü veri seti; yarım gün başlangıcı (ör. 13:00) ve gece yarısı/hafta/ay sınırında segmentasyon.
- Tahmini brüt hakediş kalemleri; maaşa zaten dahil normal ücreti iki kez eklememe; hesap ayrıntısı.
- Kullanıcının bordro netini ve **gerçekte eline geçen net tutarı**, ödeme tarihiyle ayrı kaydetmesi; avans/ek ödeme/kesinti ve kısmi ödeme kaydı.
- Temel çalışma/dinlenme risk uyarıları; kayıt engellenmez, kesin hukuk hükmü verilmez.
- Güvenli yerel saklama; ücretsiz yedekleme/geri yükleme; cihazdan tüm veriyi silme; ayarlar ve yardım.
- Uygulama içi Pro satın alma ve restore (mağaza test ortamında), ücretsiz çekirdek korunur.

## 4. MVP dışı (onaysız eklenemez)

Bulut senkronizasyonu, üyelik/şifre/SMS, işveren paneli, GPS/konum/puantaj izleme, biyometrik personel takibi, otomatik resmî bordro/net maaş garantisi, banka bağlantısı, otomatik bordro OCR, AI sohbeti, reklam SDK'sı, karmaşık toplu sözleşme otomasyonu, sınırsız mevzuat uzman sistemi, web yönetim paneli, ekip/çok kullanıcı, giyilebilir cihaz ve canlı müşteri desteği. Gelişmiş rapor/PDF/CSV, widget ve takvim entegrasyonu ancak kapasiteye göre Pro/sonraki sürümde.

## 5. Ücret ve hukuk motorunun sınırları

- 4857 sayılı İş Kanunu genel çerçevesinde haftalık **45 saati aşan fazla çalışma için +%50**, sözleşmeyle belirlenmiş haftalık sürenin 45 saatten düşük olduğu durumlarda sözleşme süresi ile 45 saat arasındaki **fazla sürelerle çalışma için +%25** yasal kavramlardır; özel sözleşme, denkleştirme ve istisnalar sonucu etkileyebilir.
- **Hafta sonu +%100**, yalnız kullanıcının seçtiği işyeri ödeme varsayılanıdır; her cumartesi/pazarın yasal hafta tatili olduğu veya aynı ek ücretin her durumda zorunlu olduğu iddia edilmez.
- Ulusal bayram/genel tatil ve hafta tatili hakedişi, aylık maaşa dahil baz ücret ve ayrıca doğan ödeme ayrımıyla gösterilir; tüm kalemlere körlemesine 2× uygulanmaz.
- Resmî tatil, hafta tatili, fazla çalışma aynı zaman aralığında çakışırsa bir **PayRulePriority** politikası kullanılır; alternatif sözleşme yaklaşımı gerekiyorsa kullanıcıya açıklanır. Hukuken belirsiz kombinasyonlar otomatik kesin hakediş olarak sunulmaz.
- Denkleştirme, gece çalışması, mola ve dinlenme istisnaları için ilk sürümde açıklamalı uyarı / gerektiğinde manuel düzeltme; kesin uygunluk denetimi değil.
- Yasal risk uyarı matrisi: günlük 11 saat, gece genel 7,5 saat, postalar arası 11 saat dinlenme, yedi günlük periyotta 24 saat kesintisiz hafta tatili, yıllık 270 saat fazla çalışma, eksik mola. İstisna/uygulama kapsamı ayrıca incelenir.
- **Yayın öncesi Türk iş hukuku uzmanı incelemesi** gereklidir; uzman doğrulaması olmadan mevzuata tam uygunluk iddiası kullanılmaz.
- Net ücret **otomatik kesin hesaplanmaz**. SGK/vergi parametreleri yıldan yıla değişir. Tahmini brüt ile fiilî net doğrudan 'eksik ödenen tutar' olarak kıyaslanmaz; bordro neti ile alınan net karşılaştırılır.

## 6. Hesaplama ve veri değişmezleri

- Para **integer kuruş** veya doğrulanmış decimal kütüphanesiyle; süre **integer dakika**; yuvarlama politikası sürümlü. Float ile para birikimi yasak.
- Tarih: olay UTC instant + IANA zaman dilimi (başlangıç `Europe/Istanbul`) + gerektiğinde yerel takvim günü. Gün ışığı saati değişiklikleri ve geçmiş tarih test edilir.
- İş kayıtları çakışamaz; plan kayıtları tek günlük istisna ile döngüden bağımsız değişebilir.
- WorkRecord -> WorkSegment -> CalculationSnapshot hattı saf, deterministik, idempotent fonksiyonlarla işlenir.
- Snapshot en az: workRecordId, ruleVersionId, holidayDatasetVersion, baseRateMinor, segmentMinutes, multiplierBasisPoints, includedInBaseSalary, roundingMode, amountMinor, calculatedAt.
- Veri modeli: WorkplaceProfile, ShiftTemplate, ShiftCycle, PlannedShift, WorkRecord, Break, Leave, PayRuleSet/Version, Holiday, WorkSegment, CalculationSnapshot, PayPeriod, PayslipNet, Payment, PaymentAllocation, Adjustment, AuditEvent.
- Aynı veri modeline sahip iki cihazı eşitleme MVP'de yoktur; yedek geri yüklemesi **önce doğrula, sonra atomik uygula**, mevcut verinin üstüne yazma öncesi açık onay al.

## 7. Mimari ve kod standardı

- **React Native + Expo + TypeScript strict + Expo Router + SQLite**; paket yöneticisi npm. Expo SDK ve bağımlılık sürümleri ilk scaffold görevinde resmî uyumlulukla sabitlenir.
- Yerel SQLite source-of-truth. UI -> application/use-case -> pure domain -> repository/storage tek yönlü bağımlılık; domain katmanı React ve SQLite'a bağımlı olamaz.
- Önerilen dizinler: `app/` (routing), `src/features/`, `src/domain/`, `src/data/`, `src/components/ui/`, `src/theme/`, `src/i18n/`, `src/lib/`, `tests/`.
- Şema değişikliği migration ile, yıkıcı dönüşüm öncesi yedek ve round-trip testiyle yapılır. Finansal geçmiş ve rule snapshot değişmezliği korunur.
- Modül sınırları: vardiya, çalışma, kazanç, ödeme, takvim, ayarlar; ortak UI bileşenleri tekrar kullanılabilir. Gereksiz state management/framework eklenmez.
- Production secrets, gerçek maaş kayıtları ve özel kullanıcı verisi repoya konmaz. Public repo için .gitignore ve örnek veri yalnız sentetiktir.

## 8. Tasarım anayasası

- Hedef: rafine, premium, hızlı, güven veren, fabrikada kısa arada tek elle kullanılabilen arayüz. **Önce görsel tasarım sistemi, sonra ekranlar.**
- 4 sekme: **Bugün / Takvim / Kazanç / Ayarlar**. Bugün ekranında sonraki vardiya, çalışılan saat, ayın tahmini kazancı ve birincil 'Çalışma ekle' eylemi.
- Tema: light/dark; semantik renk tokenları, 8 pt spacing, tutarlı radius/elevation, okunaklı sayısal tipografi, ikon+metin. Renk tek bilgi taşıyıcısı olamaz.
- Takvimde vardiya türleri etiket ve sembolle ayırt edilir; ay/hafta/gün görünümü yoğun veride dahi okunur.
- Büyük yazı, ekran okuyucu etiketleri, dinamik font, klavye/giriş odağı, erişilebilir kontrast (normal metinde en az 4.5:1 hedefi), platforma uygun dokunma alanı (yaklaşık 44pt/48dp hedefi).
- Her ekran: loading, empty, error, content, disabled, offline, kaydetme/başarı, geçersiz giriş, Pro kilidi ve veri geri yükleme onayı durumlarını gerektikçe tasarlar.
- Motion anlamlı ve kısa; reduce motion'a saygı. Gereksiz animasyon, reklam görünümü ve sahte finansal kesinlik yasak.
- UI işi ilgili UI becerisi, etkilenen ekran durumlarının doğrulanması ve gerçek Android/iOS ekran görüntüsü kontrolü olmadan tamamlanmış sayılmaz. UI alt ajanı/reviewer eşiği §12'deki risk sınıfına göre seçilir; R0/R1 UI işi tek başına ajan zorunluluğu doğurmaz.

## 9. Mahremiyet, güvenlik, yedekleme

- Yerel SQLite'ın kendiliğinden şifreli olduğu **varsayılmaz**. OS uygulama sandbox'ı başlangıç korumasıdır; hassas yedek dışa aktarımı güvenilir şifreleme/parola yöntemiyle yapılmadan 'şifreli yedek' iddiası kurulmaz.
- Uygulama maaş/ödeme tutarını analytics, crash log veya üçüncü taraf tasarım/AI araçlarına göndermez. Kullanıcı izinleri asgari düzeydedir.
- KVKK aydınlatma yükümlülüğü ve varsa açık rıza ayrı ele alınır; uygulama veri akışı ve SDK envanteri yayın öncesi incelenir.
- Ücretsiz yedekleme/geri yükleme ve verileri kalıcı silme. Geri yüklemeden önce format, şema sürümü, bütünlük ve veri çakışmaları doğrulanır.
- Her harici SDK için veri akışı, lisans, mağaza gizlilik beyanı, sürüm ve bakım maliyeti denetimi gerekir.

## 10. Kalite, test ve performans

- Hesap motoru için önce tablolu testler: +%25/+%50/+%100/özel katsayı, maaşa dahil baz, kısmi ödeme, mola, gece yarısı, hafta/ay/yıl sınırı, yarım gün tatil, çakışma, geçmiş kural sürümü, kuruş yuvarlama.
- Her hesap bug'ına regression testi. Yedek/restore, migration, uçak modu, düşük depolama, locale ve erişilebilirlik testleri.
- CI kapısı: `npm ci`, `npm run typecheck`, `npm run lint`, `npm test` (komutlar scaffold tamamlandıktan sonra kurulacaktır). PASS ancak gerçekten çalıştırıldıysa yazılır.
- Android ve iOS gerçek cihaz smoke testi, ekran görüntüsü ve temel performans ölçümü yayın öncesi zorunludur. Kaydırma akıcılığı için 60fps hedeflenir; ölçüm yapılmadan başarı ilan edilmez.
- Kritik ücret hatası, veri kaybı, uygulama çökmesi veya satın alma geri yükleme hatası açıkken production release yasak.

## 11. Monetizasyon

- Ücretsiz: vardiya takvimi, fiilî çalışma, temel otomatik mesai, tüm işyeri katsayılarını düzenleme, net ödeme kaydı, temel kazanç özeti, yedek/restore ve veri silme.
- Pro: gelişmiş dönemler arası analiz, gelişmiş raporlar, PDF/CSV, kişiselleştirme ve sonraki onaylı konfor özellikleri.
- Tek seferlik Pro fiyatı **149 TL yalnızca test hipotezidir**, mağaza fiyatı ve özellik ayrımı ayrıca onaylanır. İade/restore ve offline entitlement davranışı test edilir. Reklam yok (MVP).

## 12. Ajanlar, beceriler ve kayıt disiplini

- Ajan kullanımı risk bazlıdır; birden çok sınıf uyuyorsa **en yüksek sınıf uygulanır**. **R0 — mikro:** typo, küçük belge düzeltmesi, davranış değiştirmeyen düzenleme; ana ajan yeterlidir. **R1 — standart:** sınırlı UI/CRUD/belge işi; ana ajan uygular, bağımsız ana-ajan kontrolü yeterlidir; kapsam birden fazla modüle veya kullanıcı verisine yayılırsa reviewer yükseltilir. **R2 — kritik:** onaylanmış iş kurallarına bağlı, dar kapsamlı pay/segmentasyon değişikliği; kontrollü migration/restore; satın alma veya kişisel veri akışı değişikliği; secret/data export sınırını etkilemeyen proje-scope agent/skill/MCP yapılandırma değişikliği — bağımsız reviewer zorunludur. **R3 — yüksek:** hakediş tutarını/öncelik politikasını değiştiren algoritma, geçmiş snapshot değişmezliği, yıkıcı/veri kaybı ihtimali, kişisel/secret veri sızma sınırı, production/payments güvenlik sınırı, IAP entitlement veya release/store kararı — reviewer ve gerekçeli uzman ajan zorunludur. Belirsizlikte yüksek sınıfı seç. Aynı işi paralel çoğaltma.
- Her subagent çağrısı için soruyu, gerekçeyi, dosya/kapsam sınırını ve sonucu PROGRESS'e yaz. Reviewer bağımsız kanıt ve dar diff alır; tüm depoyu yeniden okumaz. Gerçek ajan çağrısı yapılmadıysa yapılmış denmez.
- R2/R3 görevinde ajan yeteneği yoksa `BLOCKED_AGENT_UNAVAILABLE` kaydet ve kullanıcıya alternatif review seçeneği sun; rol simülasyonunu gerçek ajan gibi gösterme. R0/R1 işte ajan yokluğu blokaj değildir.
- Her görev: **Inspect → Risk → ilgili skill → Implement → Verify → risk gerektiriyorsa Review → Evidence → Progress log → Founder gate**.
- `docs/progress/PROGRESS.md` başlangıçta, önemli karar/blokajda ve görev sonunda güncellenir; olağan görev başına en fazla üç checkpoint. Kesinti veya güvenlik/veri riski bu sınırı aşmayı gerektirebilir. Task ID, branch, dosyalar, test sonucu, reviewer (varsa), skill, karar/risk ve tek NEXT ACTION kaydedilir.
- `AGENTS.md`, `docs/DECISIONS.md`, `docs/RISKS.md`, `docs/tasks/` ve `docs/QA_TEST_MATRIX.md` aynı doğruluk kaynağına bağlıdır.
- `main`e doğrudan geliştirme push'u, PR merge, force push, history rewrite, production release ve anayasayı sessiz değiştirme yasaktır. İlk başlangıç commit'i istisnası dokümante edilir.
- Alt ajan varsayılanı: R0'da sıfır; R1'de yalnız kapsam gerektirirse bir reviewer; R2'de bir reviewer; R3'te reviewer ve yalnız gerekçeli uzman. Codex proje ayarı eşzamanlı spawned ajan sayısını en fazla ikiyle sınırlar; görevler bağımsız değilse paralellik açılmaz.

## 13. Sürüm ve yayın kapısı

- 25–35 **aktif geliştirme günü** planlama hedefi; takvim süresi, cihaz/mağaza inceleme ve geri bildirimle uzayabilir. Hız uğruna test kesilmez.
- G0: anayasa + repo/ajan temeli; G1: uygulama scaffold + veri modeli + vardiya; G2: fiilî çalışma + hesap motoru; G3: kazanç/ödeme + Pro; G4: QA, pilot kullanıcılar; G5: mağaza aday sürümü.
- Git: `feat/*`, `fix/*`, `docs/*` -> review -> PR; production için RC tag ve kurucu onayı. Geri dönüş stratejisi destructive migration değil, düzeltme/hotfix ve geri yükleme planıdır.
- Mağaza gereklilikleri yayın tarihinde yeniden kontrol edilir. Google Play kapalı test gereksinimleri hesap türüne bağlı olabilir; uygulama gönderilmeden Play Console üzerinden doğrulanır.
- **Definition of Done:** gereksinim, kod ve tasarım incelemesi, gerçek test kanıtı, veri/gizlilik değerlendirmesi, ilgili docs/progress güncellemesi, açık risk kaydı. 'Ekran açılıyor' yeterli değildir.

## 14. Açık kararlar (kurucu onayı gerektirir)

1. Ücret girişinde aylık **brüt** mü, aylık **net** mi, saatlik ücret mi varsayılan olacak? Öneri: seçenekli; brüt baz yoksa hesap 'tahmini' etiketiyle sınırlandırılır.
2. Çakışan tatil/mesai kurallarında öncelik: yüksek katsayı mı, işyeri özel kuralı mı? Öneri: açık, sürümlü işyeri politikası; hukuki belirsizlik uyarısı.
3. Aylık bordro dönemi takvim ayı mı, örn. ayın 15'i–14'ü mü? Öneri: yapılandırılabilir.
4. Yedekleme parolası ve kurtarma UX'i; şifreleme kütüphanesi/cihaz testi doğrulanacak.
5. Pro kapsamı, fiyatı, marka/mağaza adı uygunluğu ve ikon görsel yönü.
6. Tam Kare'deki `develop` entegrasyon branch'i burada da kullanılacak mı? Öneri: küçük MVP için feature branch -> main PR; büyürse develop.
7. Kapsamlı hukuki hesap iddialarının son metni uzman incelemesine tabidir.

## 15. Kaynaklar ve inceleme tarihi

İlk araştırma: **2026-11-05**. Yayın öncesi mevzuat, mağaza ve SDK sürümleri yeniden doğrulanır. Ayrıntılı bağlantılar `docs/RESEARCH_SOURCES.md` içindedir.

**Bu dosyanın statüsü:** `v1.1 APPROVED` (2026-11-05). Bölüm 14 açık kararları ayrı onay bekler.

## Değişiklik geçmişi

- **v1.1 (2026-11-05, APPROVED):** Kurucunun düşük kredi tüketimli ajan/skill/MCP mimarisi talebiyle §12 risk bazlı ajan kullanımına ve görev başına en fazla üç olağan progress checkpoint'ine geçti. Ürün kapsamı ve bölüm 14 kararları değişmedi.
