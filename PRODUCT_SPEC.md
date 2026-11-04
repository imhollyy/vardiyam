# Vardiyam — Product Spec v0.1 (kurucu onayı bekliyor)

## 1. Kullanıcı hikâyesi

Bir fabrika çalışanı vardiya döngüsünü kurar, ayın takvimini görür, gerçekleşen çalışmasını ve mesaisini kaydeder, ay sonunda tahmini brüt hakedişini kontrol eder, bordrosundaki net tutarı ve banka/elden aldığı net ödemeyi ayrı girerek ödeme mutabakatı yapar. Çalışan herhangi bir şirket sunucusuna bağlanmak zorunda değildir.

## 2. Navigasyon ve ilk açılış

**Sekmeler:** Bugün / Takvim / Kazanç / Ayarlar.

**İlk açılış (3–4 adım, atlanabilir):**
1. Hoş geldin / gizlilik: 'Veriler cihazında kalır'.
2. Vardiya düzeni: sabit, 3 vardiya, 2+2+2, 4+2, 6+1, haftalık dönüşümlü, özel döngü. Başlangıç günü ve başlangıç vardiyası.
3. İşyeri kuralları: haftalık sözleşme süresi, hafta tatili, normal +%50, hafta tatili/hafta sonu +%100, özel gün +%100; 'Bu işyeri varsayılanıdır, yasal oran iddiası değildir'.
4. Ücret: aylık brüt/saatlik brüt (opsiyonel), bordro dönemi ve ödeme günü. Atla mümkündür.

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

**Üst özet:** Çalışma dönemi; planlanan saat; fiilî net saat; normal/fazla/hafta tatili/UBGT saatleri; tahmini brüt toplam; kullanıcı girmişse bordro neti; alınan net ödeme; bordro neti–alınan net ödeme farkı.

**Kalemler:** Normal baz ücret (maaşa dahil/dahil değil), normal fazla çalışma, fazla sürelerle çalışma, hafta tatili çalışması, resmî/genel tatil, özel gün, prim/ikramiye, avans, kesinti, manuel düzeltme.

**Detay drawer/sayfa:** '2 saat × 200,00 TL × 1,50 = 600,00 TL'; segmentin tarih/saatleri, işyeri profil adı, kural sürümü, baz ücretin maaşa dahil olup olmadığı, tatil veri sürümü.

**Gerçek ödeme formu:** ödeme tarihi, net tutar, yöntem(banka/elden/diğer), ilişkilendirilen dönem(ler), açıklama. Kısmi/çoklu ödeme mümkündür. Bordro neti ayrı formdadır. Brüt-net farkı 'eksik ücret' olarak otomatik etiketlenmez.

**Kural ayarları:** yüzde zammı (+50) ve çarpanı (1,50×) aynı anda açıklayan kontrol; önizleme; geçerlilik başlangıcı; geçmişe uygulanmasın varsayılanı; tek WorkRecord override.

## 5. İş kuralları / motor

- Saat/dakika segmentasyon noktaları: mola, yerel gece yarısı, hafta başlangıcı, tatil başlangıç/bitişi (13.00 yarım gün), kural geçerlilik değişimi, bordro dönemi sınırı.
- Baz saatlik ücret, ücret türü ve çalışma dönemi dikkate alınarak belirlenir; aylık ücret için bölen yönteminin işyeri politikasına bağlı olduğu açıklanır. **Bölen sabitini kullanıcı onayı olmadan kesinleştirme.**
- İşyeri profili başlangıcı: normal fazla çalışma 1,50×, hafta sonu/hafta tatili 2,00×, özel gün 2,00×; sözleşme 45 saatin altındaysa yasal fazla sürelerle çalışma 1,25× ayrı kategori.
- Hafta tatili ≠ cumartesi/pazar; döngüsel tatil günü desteklenir.
- UBGT çalışması için zaten ödenmiş/maaşa dahil normal günlük tutar ayrıca tekrar eklenmez; ek ödeme ayrı satırda.
- Bir saat için birden fazla aday kural oluşursa çakışma politikasına göre seç, açıklama üret; belirsizliği otomatik kesinleştirme.
- 'İşyeri kuralı' ve 'yasal bilgilendirme' iki farklı metin/alan; hukuki uzman onayı olmadan kesin yasal hak iddiası yok.
- Snapshot hesaplanan sonuçları, kural sürümü ve temel verilerle sabitler; kullanıcı manuel yeniden hesaplama talep ederse önce farkı gösterir.

## 6. Ekran kabul kriterleri

**Bugün:** Vardiya bilgisi 2 dokunuşta; çalışma ekleme tek birincil CTA; internet kapalıyken çalışır; uzun vardiya etiketi taşmaz.

**Takvim:** 6+ ay döngü deterministik; seçili günün plan/gerçek farkı görülür; renk körlüğü için etiket/ikon; gece yarısı kayıtları doğru günlenir.

**Kazan ç:** 1 kuruş farkla bile tutar tutarlı; brüt/net/ödeme başlıkları karışmaz; hangi kural uygulandığı açıklanır; tarih filtreleri doğru.

**Ayarlar:** işyeri profili, ücret dönemi, oranlar, tema, yedek/geri yükle, verileri sil, gizlilik, sürüm. Oran değişimi öncesi örnek tutar önizlemesi.

## 7. Tasarım sistemi başlangıç yönü

'Endüstriyel netlik, finansal güven': koyu lacivert/füme nötrler, tek canlı vurgu rengi; semantik vardiya renkleri ve ikon+etiket; açık ve koyu tema; yüksek kontrast; gereksiz gradyan/kart yığını yok. Nihai palet, font, ikon ve 4 ana ekran için wireframe/screenshot kurucu onayından sonra kilitlenir.

## 8. MVP tamamlanma ölçüsü

- Kurulum ve vardiya döngüsü offline; plan/gerçek ayrımı.
- 30–40+ kritik hesap fixture'ı; bağımsız review; 0 P0/P1 hesap/veri hatası.
- Kısmi ödeme ve net bordro ayrımı.
- Yedek/restore round-trip.
- Gerçek Android/iOS test ve erişilebilirlik kanıtı.
- Pro sandbox purchase/restore ve mağaza gizlilik beyanı.
