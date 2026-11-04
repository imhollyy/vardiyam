# Vardiyam — Product Spec v0.1 (APPROVED — 2026-11-05)

> **Durum:** Kurucu 2026-11-05 tarihinde GitHub Issue #3 üzerinden v0.1'i ve Q1–Q3 kararlarını açıkça onayladı. Q1–Q3 kapsam ve sınırları Issue #3'te kaydedildi. Bu onay `main` merge veya production release izni değildir.

## 1. Kullanıcı hikâyesi

Bir fabrika çalışanı vardiya döngüsünü kurar, ayın takvimini görür, gerçekleşen çalışmasını ve mesaisini kaydeder, ay sonunda tahmini brüt hakedişini kontrol eder, bordrosundaki net tutarı ve banka/elden aldığı net ödemeyi ayrı girerek ödeme mutabakatı yapar. Çalışan herhangi bir şirket sunucusuna bağlanmak zorunda değildir.

## 2. Navigasyon ve ilk açılış

**Sekmeler:** Bugün / Takvim / Kazanç / Ayarlar.

**İlk açılış (3–4 adım, atlanabilir):**
1. Hoş geldin / gizlilik: 'Veriler cihazında kalır'.
2. Vardiya düzeni: sabit, 3 vardiya, 2+2+2, 4+2, 6+1, haftalık dönüşümlü, özel döngü. Başlangıç günü ve başlangıç vardiyası.
3. İşyeri kuralları: haftalık sözleşme süresi ve gerçek hafta tatili düzeni; birbirinden bağımsız oran alanları olarak normal fazla çalışma +%50, takvim hafta sonu +%100, gerçek hafta tatili +%100, resmî tatil +%100 ve işyeri özel tatili +%100. Her oran değiştirilebilir; 'Bu işyeri varsayılanıdır, yasal oran iddiası değildir'.
4. Ücret ve dönem: son ve isteğe bağlı adım. Kullanıcı Aylık brüt, Saatlik brüt, Yalnız net ödeme veya Şimdilik geç seçeneklerinden birini kendisi seçer. Bordro dönemi ve ödeme günü yapılandırılabilir.

**Aylık brüt başlangıç önerisi:** Saatlik hesap için 225 saat, işyeri profiline bağlı ve düzenlenebilir başlangıç önerisi olarak gösterilebilir. Kullanıcı bu böleni açıkça onaylamadan herhangi bir hesaplamada kullanılamaz; evrensel veya yasal kesin değer iddiası değildir. Değişiklik sürümlenir ve geçmiş hesapları sessizce değiştirmez.

**Boş veri:** Örnek kişisel veri üretme; sentetik tanıtım ekranı kullanılabilir ama gerçek kayda karışmaz.

## 3. Vardiya modeli

- ShiftTemplate: ad, kod (S/A/G gibi), renk+ikon, başlangıç saati, bitiş saati, ücretli/ücretsiz mola, toplam net süre.
- ShiftCycle: ad, gün bazlı döngü öğeleri, anchorLocalDate, timezone, başlangıç indeks. Döngüde OFF/izin günleri bulunabilir.
- PlannedShift: gün, plan başlangıç/bitiş, template/cycle ref, override gerekçesi.
- WorkRecord: fiilî başlangıç/bitiş, mola(lar), not, kaynak(manuel), onay durumu; planla eşleştirilebilir ama bağımsızdır.
- Gece yarısını aşan vardiya başlangıç gününe bağlanır; hesap motoru gerçek zaman aralıklarına göre segmentler.
- Aynı gün plan override döngünün sonraki günlerini bozmaz.
- 12 saatlik vardiya 'yasal olarak uygundur' anlamına gelmez; gerekiyorsa uyarı çıkar.

## 4. Kazanç ekranı — ayrıntılı

**Üst özet:** Seçili yapılandırılabilir bordro dönemi; planlanan saat; fiilî net saat; normal/fazla/hafta tatili/UBGT saatleri; hesaplamaya yetecek brüt ücret bilgisi mevcutsa tahmini brüt; kullanıcı girmişse bordro neti; kullanıcı kaydetmişse fiilen alınan net ödeme; yalnız bordro neti ile fiilî net ödeme arasındaki fark. Yalnız net ödeme takibi seçilmişse tahmini brüt alanı hiç gösterilmez.

**Kalemler:** Normal baz ücret (maaşa dahil/dahil değil), normal fazla çalışma, fazla sürelerle çalışma, hafta tatili çalışması, resmî/genel tatil, özel gün, prim/ikramiye, avans, kesinti, manuel düzeltme.

**Detay sayfası:** '2 saat × 200,00 TL × 1,50 = 600,00 TL'; segmentin tarih/saatleri, işyeri profil adı, uygulanan tek kural ve nedeni, kural sürümü, baz ücretin maaşa dahil olup olmadığı ve tatil veri sürümü. Çakışan kurallar toplanmaz. Öncelik açık ve uygulanabilir değilse tutar kesinleştirilmiş gibi sunulmaz; uyarı ve manuel düzeltme olanağı gösterilir.

**Gerçek ödeme formu:** ödeme tarihi, net tutar, yöntem (banka/elden/diğer), ilişkilendirilen dönem(ler), açıklama. Kısmi/çoklu ödeme mümkündür. Bordroda yazan net tutar ayrı alanda/formda saklanır; fiilen alınan net ödeme ayrı ödeme kaydıdır; tahmini brüt üçüncü ve ayrı bir değerdir. Brüt-net farkı 'eksik ücret' olarak otomatik etiketlenmez.

**Kural ayarları:** yüzde zammı (+50) ve çarpanı (1,50×) aynı anda açıklayan kontrol; önizleme; geçerlilik başlangıcı; geçmişe uygulanmasın varsayılanı; tek WorkRecord override.

## 5. İş kuralları / motor

- Saat/dakika segmentasyon noktaları: mola, yerel gece yarısı, hafta başlangıcı, resmî tatil başlangıç/bitişi (13.00 yarım gün), kural geçerlilik değişimi, yapılandırılabilir bordro dönemi sınırı.
- Ücret girişi üç moddan biridir: aylık brüt, saatlik brüt veya yalnız net ödeme takibi; ücret bilgisi vermeden devam etmek de mümkündür. Hesaplanmış tahmini brüt, yalnız brüt baz ve gerekli işyeri kuralı bilgileri mevcut olduğunda gösterilir. Net-only modunda tahmini brüt hesaplanmaz ve gösterilmez.
- Baz saatlik ücret, ücret türü ve bordro dönemi dikkate alınarak belirlenir. Aylık brütü saatliğe çeviren saat böleni WorkplaceProfile/işyeri profiline ait ayardır. 225 saat yalnız düzenlenebilir başlangıç önerisidir; kullanıcı açıkça onaylamadan hesapta kullanılamaz. Bölen değişikliği sürümlenir ve geçmiş snapshot'ları sessizce değiştirmez.
- İş günü sınıfları birbirinden ayrıdır: takvim hafta sonu (Cumartesi/Pazar etiketi), işyeri tarafından takvim/döngü üzerinde belirlenen gerçek hafta tatili, kaynaklı ulusal/resmî tatil ve işyeri tarafından tanımlanan özel tatil. Hafta sonu günü tek başına hafta tatili veya resmî tatil sayılmaz.
- İşyeri profili için başlangıç ek oranları: normal fazla çalışma +%50 (1,50×), takvim hafta sonu +%100 (2,00×), gerçek işyeri hafta tatili +%100 (2,00×), resmî tatil +%100 (2,00×) ve işyeri özel tatili +%100 (2,00×). Tatil türleri ve oran ayarları ayrı tutulur; tüm oranlar bağımsız değiştirilebilir. Bunlar işyeri ödeme başlangıçlarıdır, yasal oran iddiası değildir.
- Haftalık sözleşme süresi 45 saatin altındaysa, fazla sürelerle çalışma (+%25 / 1,25×) kavramı ayrı kategori ve yasal bilgilendirmedir; işyeri başlangıç katsayılarıyla karıştırılmaz.
- UBGT çalışması için zaten ödenmiş/maaşa dahil normal günlük tutar ayrıca tekrar eklenmez; ek ödeme ayrı satırda.
- Bir zaman aralığına birden fazla mesai/tatil kuralı uyuyorsa ek oranlar otomatik toplanmaz ve aynı dakika iki kez ücretlendirilmez. Başlangıç işyeri politikası geçerli en yüksek tek katsayıyı seçer. Çakışma, seçilen tek kural ve seçim gerekçesi kayıtta ve detayda açıklanır; eşit en yüksek katsayı veya başka çözümlenmemiş belirsizlik varsa uyarı gösterilir ve kullanıcı manuel düzeltme yapabilir. Bu politika yasal hakediş garantisi değildir.
- 'İşyeri kuralı' ve 'yasal bilgilendirme' iki farklı metin/alan; hukuki uzman onayı olmadan kesin yasal hak iddiası yok.
- Bordro dönemi başlangıç/bitişi (ör. takvim ayı veya ayın 15'i–14'ü) yapılandırılabilir ve işyeri profiliyle ilişkilendirilir. Dönem değişikliği mevcut ödeme/bordro kayıtlarını sessizce başka döneme taşımaz.
- Snapshot hesaplanan sonuçları, ücret türü/bazı, aylık bölen ayarı (kullanıldıysa), kural sürümü, uygulanan tek kural ve temel verilerle sabitler; kullanıcı manuel yeniden hesaplama talep ederse önce farkı gösterir.
- Bordro neti (bordroda yazan değer), tahmini brüt hakediş ve fiilen alınan net ödeme ayrı alanlar/kayıtlardır. Yalnız bordro neti–fiilî net ödeme karşılaştırılır; brüt ile net arasından eksik ödeme sonucu çıkarılmaz.

## 6. Ekran kabul kriterleri

**Bugün:** Vardiya bilgisi 2 dokunuşta; çalışma ekleme tek birincil CTA; internet kapalıyken çalışır; uzun vardiya etiketi taşmaz.

**Takvim:** 6+ ay döngü deterministik; seçili günün plan/gerçek farkı görülür; renk körlüğü için etiket/ikon; gece yarısı kayıtları doğru günlenir.

**Kazanç:** Para hesaplaması kuruş hassasiyetinde tutarlı; tahmini brüt, bordro neti ve fiilî net ödeme ayrı etiket/değer olarak görünür; net-only modunda tahmini brüt etiketi veya tutarı hiç gösterilmez; uygulanan kural ve nedeni açıklanır; belirsiz çakışmada uyarı ve manuel düzeltme sunulur; yapılandırılmış bordro dönemi filtresi yalnız ilgili kayıtları kapsar.

**Ayarlar:** işyeri profili, ücret türü (aylık brüt/saatlik brüt/net-only/ücret bilgisi yok), varsa aylık saat böleni ayarı, bordro dönemi, tatil/hafta tatili sınıflaması, bağımsız değiştirilebilir oranlar, tema, yedek/geri yükle, verileri sil, gizlilik ve sürüm. Oran ve bölen değişikliği öncesi örnek tutar önizlemesi; onaysız kesin bölen varsayımı yok.

## 7. Tasarım sistemi başlangıç yönü

'Endüstriyel netlik, finansal güven': koyu lacivert/füme nötrler, tek canlı vurgu rengi; semantik vardiya renkleri ve ikon+etiket; açık ve koyu tema; yüksek kontrast; gereksiz gradyan/kart yığını yok. Nihai palet, font, ikon ve 4 ana ekran için wireframe/screenshot kurucu onayından sonra kilitlenir.

## 8. MVP tamamlanma ölçüsü

- Kurulum ve vardiya döngüsü offline; plan/gerçek ayrımı.
- 30–40+ kritik hesap fixture'ı; bağımsız review; 0 P0/P1 hesap/veri hatası.
- Aylık brüt, saatlik brüt, net-only ve ücret girmeden kullanım akışları; net-only görünümünde brüt tahmininin yokluğu.
- İşyeri profiline bağlı ve sabit varsayılmayan aylık bölen; yapılandırılabilir bordro dönemi.
- Hafta sonu, işyeri hafta tatili, resmî tatil ve işyeri özel tatilinin ayrı sınıflandırılması; değiştirilebilir +%50/+%100/+%100 işyeri başlangıç oranları.
- Çakışan kurallarda otomatik toplama/çift sayım olmaması; seçilen kural açıklaması ve belirsizlikte uyarı + manuel düzeltme.
- Tahmini brüt, bordro neti, fiilî net ödeme ve kısmi ödeme ayrımı.
- Yedek/restore round-trip.
- Gerçek Android/iOS test ve erişilebilirlik kanıtı.
- Pro sandbox purchase/restore ve mağaza gizlilik beyanı.
