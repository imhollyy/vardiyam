# Vardiyam — Tasarım Sistemi Taslağı v0.1

> Kurucu görsel yönü onaylayana kadar **öneridir**. Amaç sıradan tablo uygulaması değil; yüksek güven ve hızlı işlem hissi veren mobil ürün.

## Görsel yaklaşım

**Karakter:** sakin, endüstriyel netlik, premium finans uygulaması titizliği. Fazla gölge, renk karmaşası, sahte 3D ve dekoratif dashboard kartları yok.

**Tipografi:** platform sistem fontu veya lisansı uygun yüksek okunaklı aile; tutar/saatlerde tabular numerals; güçlü hiyerarşi (başlık, birincil sayı, yardımcı etiket). Kullanıcı yazı boyutuna uyumlu.

**Renkler:** light/dark semantik tokenlar: `background`, `surface`, `surfaceElevated`, `textPrimary`, `textSecondary`, `border`, `accent`, `success`, `warning`, `danger`. Vardiya renkleri ayrıca `shiftMorning`, `shiftEvening`, `shiftNight`, `shiftOff`; mutlaka metin/kod/ikon eşlik eder. Nihai HEX palet, görsel örnek sonrası onaylanacak.

**Ritim:** 8pt spacing ölçeği, tutarlı 12/16/24 radius seviyeleri, dokunma hedefi yaklaşık 44pt iOS / 48dp Android, bottom tab güvenli alan, tek ana CTA.

**Motion:** yalnız geçiş ve işlem geri bildirimi, kısa ve reduced motion destekli; takvim animasyonu akıcılığı bozmaz.

## Dört ana ekranın bilgi hiyerarşisi

### Bugün
- Üst: gün/tarih, işyeri profili ve gelecek vardiya.
- Ana blok: 'Bugünkü vardiyam' — başlangıç/bitiş, kalan süre, plan/gerçek ayrımı.
- İkincil blok: bu dönem çalışılan net saat ve **tahmini brüt** (ücret girilmediyse saklanır).
- Birincil CTA: 'Çalışma ekle'. Hızlı düzenleme, yanlış kaydı geri alabilme.

### Takvim
- Ay görünümünde her hücrede vardiya kodu + semantik işaret.
- Seçilen gün alt panel: plan, gerçekleşen, mola, mesai, izin, açıklama.
- Döngü düzenleme tüm gelecek günleri etkileyebilir; tek gün override geçmişi bozmaz.

### Kazanç
- Dönem seçici; tahmini brüt, bordro neti, fiilî alınan net ödeme **ayrı başlık ve bilgi notlarıyla**.
- Mesai kategorileri, kural çarpanı, hesap dökümü.
- 'Net ödeme ekle' ve 'Bordro neti gir' ayrı eylemler.
- Brüt ve net doğrudan fark hesabında eşitlenmez.

### Ayarlar
- İşyeri profili, vardiya döngüsü, haftalık sözleşme saati, gerçek hafta tatili, ücret ve katsayılar, bildirimler, tema, yedekle/geri yükle, verileri sil, gizlilik.
- Oran değişikliğinde '+%50 = 1,50×' önizlemesi; geçmiş hesapları koruma açıklaması.

## Ekran kalitesi kabul kriterleri

- Loading/empty/error/content/disabled/offline ve kaydetme başarısı durumları.
- Küçük ekran 320–360dp ve büyük ekran; uzun Türkçe metin; 200% metin büyütme.
- Açık/koyu tema; 4.5:1 normal metin kontrast hedefi; ekran okuyucu etiketleri.
- Tarih/saat, para formatı `tr-TR`; negatif, sıfır ve çok büyük tutarlar.
- En az 4 ekranın gerçek Android+iOS screenshot incelemesi; cihaz testinden önce 'premium tamamlandı' denmez.

## İlk tasarım görevi

G1 başında UI ajanı 4 ana ekran için **iki ayrı görsel yön** çıkarır; bağımsız UI/a11y reviewer değerlendirir; kurucu birini seçer. Sonra tema tokenları sabitlenir ve gerçek bileşenler geliştirilir.
