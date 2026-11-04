# Vardiyam — Mevzuat / İşyeri Politikası Ayrımı

**Durum:** Araştırmaya dayalı ürün gereksinimi; hukuk görüşü değildir. Yayın öncesi Türk iş hukuku uzmanı onayı gerekir.

## Ayrı katmanlar

1. **LegalReferenceRule:** Yürürlük dönemi, kaynak URL/madde, kapsam, istisna, bilgilendirme/uyarı. Kullanıcı tarafından 'yasa' olarak düzenlenmez.
2. **WorkplacePayRule:** Kullanıcının işyerindeki fiilî uygulaması, başlangıç +%50/+%100/+%100, efektif tarih, katsayı ve çakışma önceliği.
3. **WorkRecordOverride:** Tek çalışma kaydına özgü kullanıcı düzeltmesi, neden ve geçmiş snapshot.
4. **CalculationSnapshot:** O an kullanılan kural, ücret, tatil veri sürümü ve hesap dökümü.

## Önemli ayrımlar

- **Normal gün fazla çalışma:** Kullanıcı başlangıç profili +%50; yasal fazla çalışma kavramı haftalık çalışma koşullarına bağlıdır.
- **Fazla sürelerle çalışma:** Sözleşme haftalık süresi 45 saatten düşükse, sözleşme sınırından 45 saate kadar ayrı +%25 kategorisi; istisna/denkleştirme kontrolü.
- **Cumartesi/pazar:** Takvim günü tek başına yasal hafta tatili belirlemez. İşyeri 'hafta sonu zammı' ile gerçek 24 saatlik hafta tatili farklıdır.
- **UBGT:** 2429 tatil takvimi ve 13.00 yarım gün sınırları; maaşa dahil günlük baz ile ilave ödeme ayrı.
- **Gece:** Gece çalışması ve dinlenme için uyarılar; özel iş türü ve kanuni istisna ihtimalleri kaydedilir.
- **Denkleştirme:** Uygulanıyorsa haftalık 45 saat aşımı tek başına kesin fazla çalışma sonucu değildir; kullanıcı bilgilendirmesi ve manuel işyeri kuralı.
- **Aylık ücretin saatlik karşılığı:** Bordro/işyeri politikasına göre bölen değişebileceğinden kurucu kararı ve açıklama olmadan sabit 225 gibi değer **koda gömülmez**.
- **Gerçek net ödeme:** 'Alınan net' kullanıcı beyanıdır. Tahmini brüt ile doğrudan fark hesaplamak yerine, bordro neti ile alınan net ödeme mutabakatı yapılır.

## Uyarı davranışı

11 saat günlük, 7,5 saat gece, 11 saat vardiyalar arası, 24 saat hafta tatili, 270 saat yıllık fazla çalışma, eksik mola veya hukuki kural çakışması **bilgilendirici uyarı** üretir; kayıt engellenmez. İstisna/uygulama farklılığı açıkça belirtilir.

## Hukuki review kapısı

- Her yasal uyarı için birincil kaynak, geçerlilik tarihi ve istisna notu.
- Her hesaplama kategorisi için test fixture ve hesap ayrıntısı.
- Uzman onayı olmadan 'hak ettiğiniz kesin ücret' ve 'mevzuata %100 uygun' ifadeleri kullanılmaz.
- Mevzuat güncellenirse kaynak, veri sürümü ve etkilenen hesap snapshot'ları analiz edilir; geçmiş sessiz değiştirilmez.
