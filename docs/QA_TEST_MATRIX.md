# Vardiyam — Hesap ve Cihaz Test Matrisi v0.1

## VDY-004 — Fiilî çalışma kayıtları (otomatik test kanıtı)

| ID | Senaryo | Beklenen | Otomatik kanıt |
|---|---|---|---|
| WR01 | Temiz SQLite ve v2 veritabanına v3 migration | `work_records` eklenir; v1/v2 şema ve satırlar korunur; başarısız migration rollback olur | `tests/data/migrations.test.mjs` |
| WR02 | Plansız kayıt oluştur, oku, düzenle ve sil | UTC anlar, IANA zone, mola ve not kalıcı CRUD yapar | `tests/data/workRecordRepository.test.mjs` |
| WR03 | SQLite kapat/aç | kayıt soğuk yeniden açılışta korunur | `tests/data/workRecordRepository.test.mjs` |
| WR04 | Gece yarısı/yıl sınırı | yerel başlangıç ve ertesi gün bitiş doğru UTC anlarına dönüşür | `tests/domain/work-record.test.mjs` |
| WR05 | Mola 0, süreye eşit, negatif, kesirli veya süreden uzun | geçerli sınır kabul; geçersiz değerler reddedilir | domain/repository work-record testleri |
| WR06 | Aynı kullanıcıda çakışan ve bitişik aralık | çakışma açıkça reddedilir; sınırda bitişiklik kabul edilir; eşzamanlı yazımda da tek kayıt kalır | `tests/data/workRecordRepository.test.mjs` |
| WR07 | Planlı kayıt; sonra override/cycle/template değişikliği veya silme | kayıt ile plan anlık görüntüsü korunur; plan değişikliği fiilî kaydı yeniden yazmaz | `tests/data/workRecordRepository.test.mjs` |
| WR08 | Vardiya planı olmayan gün | plan bağlantısı olmadan çalışma kaydı saklanır | `tests/data/workRecordRepository.test.mjs` |
| WR09 | DST boşluğu/tekrarlanan yerel saat | boşluk reddedilir; tekrarlanan saat kullanıcı seçimi olmadan kaydedilmez | `tests/domain/work-record.test.mjs` |

Son çalıştırma sonucu ve CI kanıtı ilgili görev günlüğünde kaydedilir. Android/iOS özellik kabul cihaz testi bu görev için zorunlu değildir; yapılmadıysa ayrıca NOT RUN olarak kalır.

## VDY-005A — UTC çalışma segmentasyonu

| ID | Senaryo | Beklenen | Otomatik kanıt |
|---|---|---|---|
| WS01 | 08:00–16:00, bilinen 30 dk mola 12:00–12:30 | mola dilimleri çıkarılır; toplam 450 çalışılan dk korunur | `tests/domain/work-segmentation.test.mjs` |
| WS02 | 22:00–06:00, yalnız toplam mola 30 dk | gece yarısı iki yerel güne bölünür; toplam net 450 dk bilinir, segment `workedMinutes` null ve 30 dk atanmamış | aynı |
| WS03 | 28 Ekim 10:00–18:00, kaynak penceresi yerel 13:00'te başlıyor | tam 13:00 UTC kesimi/işaretçisi; hukuk/ücret sınıfı motor tarafından çıkarılmaz | aynı |
| WS04 | 31 Aralık 22:00–1 Ocak 06:00 | yerel gün/ay/yıl anahtarları değişir, süre çift sayılmaz | aynı |
| WS05 | Pazar 23:00–Pazartesi 07:00 | yapılandırılmış Pazartesi hafta başlangıcında böler; yasal hafta tatili alanı üretilmez | aynı |
| WS06 | Bordro başlangıç günü 15, 14'ünden 15'ine gece vardiyası | `payrollPeriodStartDate` doğru değişir | aynı |
| WS07 | DST ilkbahar/sonbahar ve yerel gece yarısındaki DST gap | dakika gerçek UTC elapsed süresidir; IANA yerel tarih kesimi doğru bulunur | aynı |
| WS08 | Çakışan/taşan molalar; bitişik molalar | çakışma/taşma reddedilir; bitişik aralık kabul edilir | aynı |
| WS09 | Çakışan tatil/kural boundary pencereleri | parçalar atomik ve çakışmasız; her gerçek dakika bir kez sayılır, tüm aktif kaynak kimlikleri eklenir | aynı |
| WS10 | Zamanlı mola toplamı WorkRecord `breakMinutes` ile uyuşmuyor | açık tutarlılık hatası; sessiz normalizasyon yok | aynı |

## VDY-005B — Zamanlı mola ve SQLite v4

| ID | Senaryo | Beklenen | Otomatik kanıt |
|---|---|---|---|
| WB01 | Temiz 0→4 ve v3→v4 migration | `break_intervals` ve kontroller transaction içinde oluşur; eski WorkRecord satırları ve mola toplamları aynen korunur | `tests/data/migrations.test.mjs` |
| WB02 | v4 DDL hata/rollback | `user_version=3` ve v3 work records korunur; kısmi tablo/trigger kalmaz | aynı |
| WB03 | Tek/çoklu mola oluştur, değiştir ve kaldır | sıralı UTC aralıklar kalıcı CRUD yapar; kaldırınca toplam dakika silinmez | `tests/data/workRecordRepository.test.mjs` |
| WB04 | Çakışma, çalışma dışı aralık, geçersiz an, yanlış toplam | açık hata; önceki mola satırları ve WorkRecord korunur | aynı + `tests/domain/timed-break.test.mjs` |
| WB05 | Gece yarısını aşan mola ve 28 Ekim 13:00 | UTC anları korunur; segmenter sadece gerçek mola dakikalarını doğru sınır taraflarından çıkarır | `tests/data/workRecordRepository.test.mjs`; `tests/domain/timed-break.test.mjs` |
| WB06 | DST boşluğu/tekrarlanan yerel saat | var olmayan saat reddedilir; fold için kullanıcı oluşum seçer; saklama UTC'dir | `tests/domain/timed-break.test.mjs` |
| WB07 | SQLite soğuk yeniden açılış ve FK cascade | mola aralıkları kalır; yalnız WorkRecord silinirse ilişkili aralıklar silinir | `tests/data/workRecordRepository.test.mjs` |
| WB08 | Aynı connection'da eşzamanlı yazım/başarısız replace | repository kuyruğu yazımları serileştirir; hata transaction'ı rollback eder ve eski aralıklar kalır | aynı |
| WB09 | Legacy aggregate-only mola | eski `break_minutes` değişmez, timed rows oluşturulmaz, segment bazında `workedMinutes=null`; arayüz “saati belirtilmemiş” gösterir | `tests/data/workRecordRepository.test.mjs`; UI cihaz testi ayrı raporlanır |
| WB10 | WorkRecord başlangıç/bitiş veya mola toplamı değişikliği | mevcut timed interval'lar yeni kayıtla hâlâ tutarlı değilse tüm update reddedilir; geçerli ortak düzenleme tek transaction'da kaydedilir | `tests/data/workRecordRepository.test.mjs` |

## VDY-005C2 — Kalıcı ücret ayarları ve Kazanç

**Çalıştırma sonucu (2026-11-05):** `npm test` PASS 197/197; typecheck/lint/diff-check PASS; Expo Doctor PASS 20/20; Android bundle PASS (Hermes 2.9 MB); bağımsız R3 reviewer APPROVE (P0–P2 yok); GitHub Actions run #27 (`42036369312`) SUCCESS on final code commit `50cdc5b`. Gerçek Android/iOS cihaz testi NOT RUN (görev önkoşulu değil).

| ID | Senaryo | Beklenen | Kanıt |
|---|---|---|---|
| EC201 | Temiz veritabanı v0→v5 ve mevcut v4→v5 | earnings profile/rule/snapshot tabloları additive transaction ile eklenir | `tests/data/migrations.test.mjs` |
| EC202 | v5 DDL rollback | başarısız DDL kısmi tablo bırakmaz; v4 `user_version` ve metadata korunur | `tests/data/migrations.test.mjs` |
| EC203 | v1–v4 varlıkları korunumu | WorkRecord ve timed-break satırları/saatleri değişmeden kalır | `tests/data/migrations.test.mjs` |
| EC204 | Ücret/kural ayarı sürümleme | her değişiklik yeni profil ve kural sürümü ekler; eski sürüm değişmez; transaction hatası rollback olur | `tests/data/earningsRepository.test.mjs` |
| EC205 | Snapshot yazma kapısı | yalnız COMPLETE + integer kuruş + satır toplamı eşleşen + kullanıcı onayı çağrısı ile yazılır; PARTIAL/WITHHELD reddedilir | `tests/data/earningsRepository.test.mjs` |
| EC206 | Önizleme ve kaynak fingerprint | onaysız preview yazmaz; kayıt/mola değişmişse approval STALE_SOURCE ile reddedilir | `tests/data/earningsRepository.test.mjs`; `app/(tabs)/earnings.tsx` |
| EC207 | Snapshot değişmezliği/soğuk açılış | UPDATE/DELETE trigger ile reddedilir; kaynak payload, ücret ve sonuç kapanıp açılınca aynı kalır | `tests/data/earningsRepository.test.mjs` |
| EC208 | Profil/rule değişimi sonrası eski hesap | eski approved total/provenance değişmez; stale preview yeni kaydedilemez | `tests/data/earningsRepository.test.mjs` |
| EC209 | NET_ONLY/SKIP ekranı | tahmini brüt kartı, tutarı ve geçmiş brüt tutarları render edilmez | `tests/domain/earningsPresentation.test.mjs` |
| EC210 | 225 saat böleni | varsayılan öneri 225 saat ama `confirmed=false`; hesap girişi açık onay gerektirir | `tests/domain/earningsPresentation.test.mjs`; C1 `tests/domain/earnings.test.mjs` |
| EC211 | Haftalık kayıt tamlığı | her seçili yerel hafta kullanıcı tarafından ayrı teyit edilmeden tam dönem tutarı gösterilmez | `app/(tabs)/earnings.tsx`; C1 `tests/domain/earnings.test.mjs` |
| EC212 | Tatil kaynak/kapsam | kaynak/sürüm ve tam IANA yerel tarih kapsamı doğrulanmadan tatil sınıflaması kesinleşmez; yarım gün başlangıcı kullanıcı verisidir | `app/earnings-settings.tsx`; C1 `tests/domain/earnings.test.mjs` |
| EC213 | Gerçek plan/fiilî karşılaştırma | plan süresi yalnız linkli kayıt snapshot'ları için etiketlenir; bilinmeyen dönem sınırı molası net sürede belirsiz kalır | `app/(tabs)/earnings.tsx` |
| EC214 | 15–14 dönem ve tüm hafta sorgusu | döneme kesişen tam haftalar sorgulanır, dönem satırları motorun `payrollPeriodStartDate` ile filtrelenir | `app/(tabs)/earnings.tsx`; C1 segmentasyon testleri |
| EC215 | Tema/erişilebilirlik/yükleme/hata/boş | light/dark token, checkbox/radio/button rolleri, erişilebilir adlar ve boş/yükleme/hata metinleri mevcut | kod incelemesi; gerçek cihaz NOT TESTED |
| EC216 | Ücret/kural geçerlilik tarihi | varsayılan bugün ve yerel IANA gece yarısı; seçili dönem ücret profilinden önceyse veya kaynak çalışma ücretten eskiyse kesin tutar onaylanmaz | `src/features/earnings/profile.ts`; `tests/domain/earningsPresentation.test.mjs`; `app/earnings-settings.tsx` |

> Aşağıdaki VDY-004 satırları uygulanmış otomatik senaryoları ve dosya kanıtlarını listeler. Diğer hesap ve cihaz satırları planlanan kapsamdır; her görev kendi gerçek PASS/FAIL/SKIP sonucunu `docs/progress/PROGRESS.md` içinde kaydeder.

## Zaman ve vardiya

| ID | Senaryo | Beklenen |
|---|---|---|
| T01 | 08:00–16:00, 30 dk mola | 450 net dakika |
| T02 | 22:00–06:00, 30 dk mola | 450 net dakika; 2 takvim günü |
| T03 | 28 Ekim 10:00–18:00 | 13:00 öncesi/sonrası ayrı tatil segmentleri |
| T04 | 31 Aralık 22:00–1 Ocak 06:00 | yıl/tatil sınırı segmentleri |
| T05 | Pazar 23:00–Pazartesi 07:00 | hafta sınırı; işyeri hafta tatili profiline göre |
| T06 | Aynı gün iki çakışan WorkRecord | doğrulama hatası, çift süre yok |
| T07 | 2+2+2 döngü 180 gün | anchor gününden deterministik döngü |
| T08 | Tek gün plan override | sonraki döngü günleri değişmez |
| T09 | Ücretsiz/ücretli mola ayrımı | net çalışma doğru |
| T10 | DST geçmiş tarih/timezone değişimi | UTC instant kaybı yok |

## Para ve kurallar

| ID | Senaryo | Beklenen |
|---|---|---|
| P01 | 200 TL/saat, 2 saat, +%50 | 600 TL toplam kalem (1,50×) |
| P02 | 200 TL/saat, 2 saat, +%100 | 800 TL toplam kalem (2,00×) |
| P03 | 200 TL/saat, 2 saat, +%25 | 500 TL toplam kalem (1,25×) |
| P04 | İşyeri oranı +%75 | 1,75× ve doğru yuvarlama |
| P05 | Aylık maaşa dahil baz | baz tutar ikinci kez eklenmez |
| P06 | Resmî tatil + fazla mesai çakışması | öncelik politikası açık, çift sayım yok |
| P07 | Hafta sonu ama çalışma günü | otomatik yasal hafta tatili sayılmaz |
| P08 | Döngüsel çarşamba hafta tatili | işyeri kuralına göre sınıflanır |
| P09 | Yeni ücret 1 Aralık'ta geçerli | Kasım snapshot'ı değişmez |
| P10 | Eski hesap yeniden hesaplama | önce fark önizlemesi ve açık onay |
| P11 | 0,01 TL yuvarlama sınırı | deterministik kuruş |
| P12 | Negatif/NaN/aşırı ücret girişi | güvenli validation |
| P13 | Bordro neti 35.000; ödeme 30.000+5.000 | 0 TL net ödeme farkı |
| P14 | Brüt 40.000, alınan net 32.000 | '8.000 eksik ödeme' gibi yanlış iddia yok |
| P15 | Ödeme birden fazla döneme bölünür | allocation toplamı ödeme tutarını aşmaz |
| P16 | Avans, kesinti, ikramiye | ayrı kategoriler, çift toplama yok |
| P17 | Sözleşme 40 saat; fiilî 43 saat | 3 saat fazla sürelerle çalışma kategorisi |
| P18 | Denkleştirme aktif | kesin fazla mesai iddiası yerine uyarı/manuel politika |
| P19 | Aylık brüt ücret modu | ücret girişi opsiyonel kalır; tahmini brüt yalnız profile ait saat böleni açıkça ayarlanmışsa hesaplanır |
| P20 | Saatlik brüt ücret modu | tanımlı saatlik bazla hesaplanır; aylık bölen uygulanmaz |
| P21 | Yalnız net ödeme modu | bordro neti ve fiilî net ödeme kaydedilebilir; tahmini brüt alanı/tutarı hiç üretilmez |
| P22 | Ücret girişi atlanır | vardiya/çalışma kaydı ve ödeme takibi kullanılabilir; brüt tahmini gösterilmez |
| P23 | Aylık brüt var, işyeri profilinde saat böleni yok | otomatik sabit bölen kullanılmaz; saatlik türetme ve ona bağlı tahmini brüt yapılmaz; ayar ihtiyacı açıklanır |
| P24 | Bordro dönemi ayın 15'i–14'ü | yalnız seçili dönemdeki saat ve ödeme kayıtları özetlenir; önceki kayıtlar taşınmaz |
| P25 | Cumartesi çalışması; profil hafta tatili başka gün | hafta sonu etiketi ile gerçek hafta tatili sınıfı ayrıdır; cumartesi kendi başına yasal hafta tatili sayılmaz |
| P26 | Resmî tatil, hafta sonu ve işyeri özel günü çakışır | sınıflar ayrı korunur; ek oranlar otomatik toplanmaz ve aynı dakika çift sayılmaz |
| P27 | Tek aday +%100 işyeri hafta tatili kuralı | başlangıç oranı +%100 (2,00×) olarak açıklanır; profil değişikliği sonrası yeni oran uygulanır |
| P28 | Bir saat için birden fazla kural adayı, açık seçim yok | kesin tutar otomatik sunulmaz; uyarı ve manuel düzeltme gösterilir |
| P29 | Açık profil kuralı çakışan adaylardan birini seçer | yalnız seçilen kural bir kez uygulanır; kural adı ve seçilme nedeni ayrıntıda görünür |
| P30 | Net-only kullanıcıya kazanç özeti | tahmini brüt etiketi, tutarı veya brüt-net farkı görünmez; bordro neti ile fiilî net ödeme ayrı gösterilir |
| P31 | Takvim hafta sonu oranı | işyeri profili başlangıç oranı +%100 (2,00×); bağımsız değiştirilebilir ve değişiklik sonrası seçilen oran açıklanır |
| P32 | Gerçek işyeri hafta tatili oranı | işyeri profili başlangıç oranı +%100 (2,00×); takvim hafta sonu ayarından ayrı ve bağımsız değiştirilebilir |
| P33 | İşyeri özel tatili oranı | işyeri profili başlangıç oranı +%100 (2,00×); resmî tatil ayarından ayrı ve bağımsız değiştirilebilir |
| P34 | Resmî tatil için işyeri oranı tanımlı | başlangıç oranı +%100 (2,00×); özel tatil ayarından ayrı ve bağımsız değiştirilebilir; tanımlı işyeri oranı yoksa kesin katsayı varsayılmaz |
| P35 | Aylık brüt için saat böleni önerisi | 225 saat düzenlenebilir işyeri profili önerisi olarak görünür; açık kullanıcı onayı olmadan hiçbir hesap bu değeri kullanmaz |
| P36 | Saat böleni değişikliği | yeni sürüm gelecekteki hesaplara uygulanır; önceki onaylı CalculationSnapshot değişmez |
| P37 | Aynı dakikada birden fazla farklı katsayılı kural | geçerli en yüksek tek katsayı bir kez seçilir ve açıklanır; oranlar toplanmaz; aynı katsayılı eşit adaylarda uyarı + manuel düzeltme sunulur |

### VDY-005C1 — Saf brüt kazanç motoru (sentetik fixture)

| ID | Senaryo | Beklenen | Otomatik kanıt |
|---|---|---|---|
| E01 | 40 ayrı katsayı/baz fixture'ı | kuruş tam sayı, sürümlü half-up, doğru tek katsayılı sonuç | `tests/domain/earnings.test.mjs` |
| E02 | 2 saat × 200 TL × 1,50 | 600 TL; normal maaşa dahil kalem tekrar eklenmez | aynı |
| E03 | 40 saat sözleşme, 43 saat tamamlanmış hafta | 3 saat +%25; 45 saat üzeri kuralından ayrı | aynı |
| E04 | 45 saat tamamlanmış hafta ve daha fazla çalışma | yalnız 45 saat sonrası +%50 sınıfı | aynı |
| E05 | +%100, özel katsayı ve farklı oranlı tatil çakışması | en yüksek tek oran, toplama yok; kaynak/sürüm detayı satırda | aynı |
| E06 | Eşit-en-yüksek farklı kurallar | kesin toplam null; açık manuel seçimle çözülebilir | aynı |
| E07 | Aylık / saatlik / net-only / ücret atlama | aylık bölen onayı gerekli; net-only/SKIP brüt ve snapshot üretmez | aynı |
| E08 | 225 saat önerisi onaysız | hesaplama withheld; öneri otomatik uygulanmaz | aynı |
| E09 | Maaşa dahil normal/holiday baz | normal baz eklenmez; PREMIUM_ONLY ve FULL_MULTIPLIER açık semantik taşır | aynı |
| E10 | Aggregate-only / timed mola | mola belirsizliği kesin tutarı engeller; gerçek aralık biliniyorsa net dakika hesaplanır | aynı |
| E11 | Takvim hafta sonu / gerçek işyeri hafta tatili / OFF | sadece açık kaynaklı kategoriler; takvim günü ve OFF rest-day türetmez | aynı |
| E12 | 28 Ekim 13:00, 31 Aralık→1 Ocak, DST | UTC dakika, yerel tarih ve dönem sınırlarında çift sayım yok | aynı |
| E13 | Bordro ayın 15'inde başlar; ücret kuralı hafta içinde değişir | dönem/versiyon kesitleri doğru; eksik/ambiguous rule aralığı kesin tutarı bekletir | aynı |
| E14 | Kayıt çakışması, eksik tam-hafta kapsamı, eksik tatil kaynağı, denkleştirme belirsizliği | total kesin tutar null; tipli uyarı | aynı |
| E15 | Kural/saat böleni revizyonu | snapshot kontratı rule/contract/holiday/engine/rounding versiyonlarını taşır; eski nesne değişmez | aynı |

Gerçek doğrulama sonuçları VDY-005C1 kapanış kaydında `docs/progress/PROGRESS.md` içinde tutulur. Bu testler sentetiktir; hukuk mütalaası, gerçek işyeri bordro teyidi veya kalıcı snapshot/SQLite kabulü değildir.

Son çalıştırma: `npm test` PASS 184/184 (57 yeni domain testi, 40 ayrı sayı fixture'ı); focused kazanç testi 57/57; `npm run typecheck` PASS; `npm run lint` PASS; `npx expo-doctor --verbose` PASS 20/20 (ağ erişimli yeniden deneme); `git diff --check` PASS; taslak PR #18 code CI run #22 (`42029068508`) ve docs-closure run #23 (`42029467408`) PASS.

## Yasal uyarı / ürün davranışı

| ID | Senaryo | Beklenen |
|---|---|---|
| L01 | Günlük >11 saat | uyarı, kayıt engellenmez |
| L02 | Gece >7,5 saat | kapsam/istisna açıklamalı uyarı |
| L03 | Postalar arası <11 saat | dinlenme uyarısı |
| L04 | 7 günde 24 saat kesintisiz dinlenme yok | hafta tatili uyarısı |
| L05 | Yıllık fazla çalışma 270 saate yakın/aşan | kaynaklı uyarı |
| L06 | 13:00 yarım gün tatil | saat bazlı bölünür |
| L07 | Eksik mola | uyarı, kullanıcı düzenleyebilir |
| L08 | Mevzuat ve işyeri oranı farklı | ayrı gösterilir |

## Veri, UI ve yayın

| ID | Senaryo | Beklenen |
|---|---|---|
| D01 | Yedekle/geri yükle | round-trip veri eşitliği |
| D02 | Hatalı/eksik yedek | mevcut DB korunur |
| D03 | Kural değişimi sonrası restore | snapshot geçmişi korunur |
| D04 | Uçak modu / cold start | temel akış çalışır |
| D05 | Light/dark + büyük yazı | taşma/kontrast sorunu yok |
| D06 | Ekran okuyucu | vardiya rengi dışında etiket okunur |
| D07 | Android+iOS gerçek cihaz | kritik 4 sekme smoke |
| D08 | Pro sandbox purchase/restore | offline entitlement tutarlı |
| D09 | Veri silme | yerel kullanıcı verisi silinir; geri dönüş uyarısı |
| D10 | Mağaza gizlilik beyanı | SDK envanteriyle tutarlı |

**Test kanıt formatı:** `caseId | komut/cihaz | tarih | PASS/FAIL/SKIP | çıktı veya screenshot referansı | reviewer`.

### Android emulator evidence — 2026-11-05

Device: `Medium_Phone_API_37.0` (Android 17 / API 37, x86_64), Expo Go, VDY-003B source HEAD `58b9091abacebbc1223e7c085d9ca3f8b96660c1`. SQLite checks used two isolated synthetic databases through the existing `SQLiteProvider` `onInit` connection. A temporary development-only diagnostic was removed after the run; it logged only mode, schema version, v2 table count, and the synthetic marker.

| Case | Result | Evidence |
|---|---|---|
| Android fresh database v0→v2 | PASS | `vdy-smoke-fresh.db`: `before=0`, `after=2`, all four v2 tables present. The Expo Go app itself was already installed; this proves a clean provider database, not a clean Expo Go reinstall. |
| Android existing v1→v2 | PASS | Separate `vdy-smoke-upgrade.db`, seeded with only `app_metadata(synthetic_smoke_marker, 'v1-preserved')`: `before=1`, `after=2`, all four v2 tables present. |
| v1 data preservation | PASS | Synthetic marker read back as `v1-preserved` after migration and again after cold restart. No real/user data was used. |
| Android application cold restart | PASS | `adb shell am force-stop host.exp.exponent`, then reopen `exp://127.0.0.1:8081`; provider reports `before=2`, `after=2`, four v2 tables, marker preserved. |
| D04 cold start subcase | PASS; airplane-mode subcase SKIP | Cold restart evidence above. Airplane mode was not enabled/tested. |
| D07 Android four-tab smoke | PASS | Screenshots: [`today.png`](progress/evidence/android-2026-11-05/today.png), [`calendar.png`](progress/evidence/android-2026-11-05/calendar.png), [`earnings.png`](progress/evidence/android-2026-11-05/earnings.png), [`settings.png`](progress/evidence/android-2026-11-05/settings.png). Captured after loading the identified source commit; Expo Go development overlay is visible. |
| D07 iOS smoke | SKIP | No iOS device/simulator available in this Windows run; R08 remains open. |
| Debug APK build | SKIP | Not required after Expo Go exercised the native Expo SQLite provider on-device. Earlier native build attempts failed at the Windows MAX_PATH limit; no system-wide long-path setting was changed. |

Runtime provenance: Metro output `Android Bundled ... node_modules\expo-router\entry.js (1319 modules)` from repository HEAD `58b9091abacebbc1223e7c085d9ca3f8b96660c1`; the same provider callback logged `before=0, after=2, v2Tables=4` and separately `before=1, after=2, v2Tables=4, syntheticMarker=v1-preserved`. `npm run typecheck` passed while the temporary diagnostic existed; the diagnostic is not present in final source.

Windows network correction: initial read-only inspection in this run found Ethernet interface 11 still Private and only two enabled inbound `adb.exe` Allow rules, both scoped Private and bound to the installed SDK adb executable. Returning Ethernet to Public was attempted once and rejected with the Network List Manager Policies / Group Policy diagnostic; the profile remains Private. ADB itself is verified local-only for this run: emulator `device`, ADB server `127.0.0.1:5037`, Expo port forwarded through `adb reverse`; no Public/Any ADB exception was created. See `docs/progress/PROGRESS.md` for the before/after record.

Independent R2 security/data reviewer: **APPROVE**, no P0/P1/P2; verified the status claims, synthetic-only marker, no remaining provider diagnostic, network-policy blocker, and open iOS/R13 gates. Results were posted to PR #4 and PR #9 conversations; neither PR was merged or changed in code.

### VDY-003C — planned schedule UI and persistence

| Case | Result | Evidence |
|---|---|---|
| Schedule creation presets (fixed, weekly three-shift, 2+2+2, 4+2, 6+1) and selected start shift | PASS | `tests/features/schedule.test.mjs`; schedule draft delegates constructors/projection to `src/domain/shift-cycle`. |
| Custom schedule, invalid templates and anchor validation | PASS | `tests/features/schedule.test.mjs`; invalid/incomplete drafts rejected before save. |
| Month navigation and leap/month boundaries | PASS | `tests/features/dates.test.mjs`; December/January and leap-February boundaries. |
| Atomic template/cycle save and editing preserves existing daily overrides | PASS | `tests/data/shiftCycleRepository.test.mjs`; repository transaction test. |
| Failed schedule save rollback | PASS | `tests/data/shiftCycleRepository.test.mjs`; synthetic failure during second template insert leaves no partial schedule. |
| SQLite close/reopen persistence | PASS | `tests/data/shiftCycleRepository.test.mjs`; isolated synthetic temporary file database. |
| Calendar one-day SHIFT/OFF/LEAVE behavior and cycle unaffected | PASS | Existing repository/domain override cases plus calendar UI review; OFF remains a planned day off, never a legal-rest claim. |
| Today/upcoming view, empty/loading/error/success, theme and accessibility | PASS (automated/static) | Implemented in Today/Calendar/Settings routes. No physical device smoke required or run for VDY-003C; see visual QA limitation below. |
| Saved cycle edit preserves exact phase, including startIndex in the middle of a repeated-shift run | PASS | Repository-backed round-trip regression in `tests/data/shiftCycleRepository.test.mjs`; pure builder case in `tests/features/schedule.test.mjs`. |
| User-editable IANA time zone and invalid zone rejection | PASS | Settings exposes IANA field; existing domain validator validates identifiers. |
| UI touch target sizing | PASS (code review) | Settings chips/remove action are ≥44 dp; calendar day press target adds 4 dp horizontal hit area. |
| `npm run typecheck` | PASS | 2026-11-05; exit 0. |
| `npm run lint` | PASS | 2026-11-05; exit 0. |
| `npm test` | PASS | 83/83 tests; includes repository persistence/rollback, exact saved phase, and schedule/date cases. |
| `npx expo-doctor --verbose` | PASS | 20/20; first attempt had transient DNS failures, successful connected retry completed all checks. |
| Android bundle export | PASS | `npx expo export --platform android --output-dir .expo\vdy-003c-export`; Metro bundled 1,190 modules. This is bundle verification, not device smoke. |
| `git diff --check` | PASS | 2026-11-05; no whitespace errors. |
| GitHub CI | PASS | Draft PR #11 head `8d110e93c4e663c7aa6fcb52eb6df9813b0c6f74`; `Verify Expo scaffold` job 127144494014 / Actions run 41997597725 completed successfully. |
| Android/iOS physical visual QA, large text and screen reader | SKIP | Not required by this task; native UI behavior is not claimed as device-verified. Existing VDY-003B Android/SQLite screenshots remain preserved above. |

Reviewer: independent R2 reviewer **APPROVE** after fixes; first review caught and the implementation addressed a saved-phase regression risk, 44 dp touch target gaps, and missing editable IANA zone. Final reviewer verified DayCell `hitSlop` correction. Keep R08 (iOS/device coverage), R13 (12 moderate audit findings), and Ethernet Public-profile policy issue separate and open.
