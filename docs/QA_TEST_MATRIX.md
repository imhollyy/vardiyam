# Vardiyam — Hesap ve Cihaz Test Matrisi v0.1

> Bu liste **planlanan testlerdir**, hiçbir test henüz çalıştırılmadı. Her vaka fixture, beklenen sonuç, kullanılan ruleVersion ve kaynak notuyla kodlanacak.

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
