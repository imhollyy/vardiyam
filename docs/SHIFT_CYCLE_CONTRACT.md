# VDY-003 — Vardiya döngüsü sözleşmesi (uygulama öncesi taslak)

> Durum: **DRAFT_FOR_CODEX_REVIEW** · 2026-11-05. Kaynak: `PRODUCT_SPEC.md` §3, `PROJECT_CONSTITUTION.md` v1.1 §§2, 3, 6, 7, `ROADMAP.md` ve `docs/QA_TEST_MATRIX.md` T02/T07/T08/T10. Bu sözleşme uygulama/kurucu onayı veya çalıştırılmış test değildir.
>
> **VDY-002 izolasyonu:** PR #4 cihaz testleri BLOCKED. Bu doküman saf domain/test hazırlığıdır; Android SDK kurulumu, Expo runtime, UI veya PR #4 merge işlemi gerektirmez.

## 1. Sınır ve değişmezler

- Döngü, **yerel takvim günleri** üzerinde hesaplanır. 24 saatin millisecond karşılığını yerel saat farkı üzerinden bölmek **yasak**: DST/geçmiş saat dilimleri döngüyü kaydırmamalı.
- `ShiftCycle` plan üretir, `WorkRecord` ise fiilen çalışılan zamandır. Planı değiştirmek çalışılmış zamanı, maaş/kazanç snapshot'ını veya sonraki döngü gününü sessizce değiştirmez.
- `CycleEntry` yalnız **SHIFT(templateId)** ya da **OFF** olur. OFF **işyerinin yasal hafta tatili**, izin, resmî tatil veya hastalık raporu olarak otomatik yorumlanmaz. Bu sınıflar sonra ayrıca tanımlanır.
- Şablon başlangıç günü `localDate` ile belirlenir; gece vardiyası aynı güne bağlanır ve bitişi ertesi gün olabilir. Tarih/saat aralıklarına ve ücret segmentasyonuna dönüştürme VDY-004/005 kapsamıdır.
- Ücret, ödeme, kural önceliği, IAP, gerçek tatil veri seti ve kişisel kayıt üretimi **kapsam dışı**. Sentetik fixture verisini gerçek maaş/veri olarak kaydetme.

## 2. Önerilen TypeScript kontratları

`ShiftTemplate`
- `id: string` (stabil), `code: string` (örn. S/A/G), `name: string`; `startLocalTime: "HH:mm"`, `endLocalTime: "HH:mm"` (24 saatlik).
- `colorToken` ve `iconKey` sunum ipuçlarıdır; bilgiyi yalnız renkle verme.
- Zaman aralığı: başlangıç < bitiş ise aynı gün, bitiş < başlangıç ise **ertesi gün**. Eşit saatler varsayılan olarak **geçersiz**, otomatik 24 saat varsayılmaz.
- Ücretli/ücretsiz mola modelleri daha sonra ilgili ayrı veri tipiyle desteklenir; saf döngü indeksi mola hesaplamaz.

`ShiftCycle`
- `id`, `name`, `timezone: IANA` (ilk profil Europe/Istanbul), `anchorLocalDate: YYYY-MM-DD`, `startIndex: integer`, `entries: CycleEntry[]`.
- `entries.length >= 1`; `0 <= startIndex < entries.length`; sıradaki her SHIFT geçerli template kimliğine işaret eder.
- Farklı işyerlerinin düzenleri açık veri olarak saklanır; isimden (örn. '2+2+2') gizli algoritma çıkarılmaz.

`PlanOverride`
- `localDate: YYYY-MM-DD` + `kind: SHIFT|OFF|LEAVE` + SHIFT ise `templateId` + isteğe bağlı `reason`.
- Aynı döngü/gün için en çok bir aktif override; `LEAVE` otomatik olarak izin veya yasal mazeret hakkı doğurduğu iddiası taşımaz.
- Override **yalnız hedef tarihte** geçerli, cycle indeksini/anchor'ı değiştirmez; silindiğinde günün döngü sonucu geri görünür.

`PlannedShift` projeksiyonu
- `localDate`, `source: CYCLE|OVERRIDE`, `kind: SHIFT|OFF|LEAVE`, `templateId?`, `cycleId?`, `cycleIndex?`, `timezone`.
- `source` ve `cycleIndex` hata ayıklama/açıklanabilirlik içindir. Gerçek çalışma kaydı oluşturmaz; SQLite kalıcı şema kararları VDY-003 uygulama adımında, migration + test incelemesiyle kesinleşir.

## 3. Deterministik algoritma

1. Girişte anchor ve hedef `localDate` değerlerini katı `YYYY-MM-DD` / proleptik Gregoryen takvim olarak doğrula. 2026-02-30 gibi normalize olan hatalı tarihleri **reddet**.
2. Takvim gün numarası üret: `dayOrdinal(localDate)`. Bu işlem takvim tarihini temsil eder; cihazın saat dilimi veya sistem saatine bağlı olmamalı. JS `Date.UTC` kullanılırsa 0–99 yıllarının özel yorumunu ve tarih normalizasyonunu açıkça önle; en azından testle kanıtla.
3. `deltaDays = dayOrdinal(target) - dayOrdinal(anchor)`.
4. `cycleIndex = euclideanModulo(startIndex + deltaDays, entries.length)` ve `euclideanModulo(n,m) = ((n % m) + m) % m` (`m > 0`). Negatif günlere güvenli sarma sağlar.
5. Override varsa yalnız sorgulanan günün görüntüsünü değiştir; sonraki günü bu sonuçla ilerletme.
6. `getProjectedRange(start,end)`, `getProjectedDay(date)` ile **aynı temel fonksiyon** üzerinden üretim yapmalı. 180 gün üzeri de deterministik olmalı; tüm takvimi baştan SQLite'a materialize etme.

Örnek: `entries=[S,S,A,A,G,G]`, `anchorLocalDate=2026-11-05`, `startIndex=0`:
- 2026-11-05 S (index 0); 11-06 S (1); 11-07 A (2); 11-08 A (3); 11-09 G (4); 11-10 G (5); 11-11 tekrar S (0).
- 2026-11-04 G (index 5); 2027-05-04 S (180 gün sonra).
- 2026-11-06 için OFF override yapılırsa, 2026-11-07 yine A'dır.

## 4. İsimlendirilmiş şablonların anlamı

| Şablon | Açık entry dizisi | Not |
|---|---|---|
| Sabit sabah | `[S]` | İşçinin gerçek dinlenme/hafta tatili ayrıca tanımlanır |
| 3 vardiya — haftalık | 7×S, 7×A, 7×G | **Vardiya değişim dizisidir; haftanın 7 günü çalışması gerektiği iddiası değildir.** Dinlenme için açık OFF/override/ayrı plan gerekir |
| 2+2+2 | `[S,S,A,A,G,G]` | Döngüde otomatik OFF eklenmez; işyeri farklıysa custom cycle kullanır |
| 4+2 | `[S,S,S,S,OFF,OFF]` | S şablonu profil tarafından seçilebilir; S burada örnek |
| 6+1 | `[S,S,S,S,S,S,OFF]` | OFF yasal hafta tatili anlamına otomatik gelmez |
| Özel | Kullanıcı tanımlı sonlu dizi | SHIFT/OFF tipleri açık; indeks sabit |

**Kritik ürün kararı açık:** 'Üç vardiya haftalık' etiketinin işyerine göre dinlenme ve rotasyon sırası değişebilir. Onboarding kullanıcıya açık döngü önizlemesi göstermeli; bu tablo tüm işyerleri için zorunlu varsayılan olarak hard-code edilmemeli.

## 5. Tarih, zaman ve validasyon

- Çevrim hesabında `Europe/Istanbul` IANA kimliği metadata olarak korunur fakat gün indeksi yerel tarih aritmetiğiyle hesaplanır; timezone offset'iyle `deltaDays` hesaplanmaz.
- Geçmiş DST geçişleri gün döngüsünü kaydırmaz; **UTC instanta dönüştürme** yalnız template tarih/saat projeksiyon katmanında, belirsiz/olmayan yerel zamanları açık politikayla ele alarak yapılır.
- `22:00–06:00` sekiz saat planlanan saat penceresidir; `2026-12-31 22:00` başlangıcı 2027-01-01 06:00'da biter. VDY-003'te ara dinlenme düşümü veya hakediş sınıflaması yok.
- Boş entries, geçersiz anchor/index/tarih/saat, bilinmeyen template ID, aynı tarih için çakışan override, aynı template ID'nin hatalı tekrarlı tanımı gibi durumları reddet.
- Kullanıcı cihaz timezone'unu değiştirdiğinde `anchorLocalDate` ve geçmiş plan projeksiyonları sessizce değişmemeli.

## 6. SQLite sonraki uygulama sınırı

VDY-002'deki mevcut `src/data/migrations.ts` schema v1 korunur. VDY-003 yalnız **additive version 2** hazırlayabilir; `PRAGMA user_version` güncellemesi transaction içinde, fixture'larla doğrulanır. `DROP/DELETE`, kullanıcı verisi üzerine yazma ve otomatik 180-gün bulk-insert yok. Depo katmanı saf `src/domain/shift-cycle` fonksiyonuna bağımlı olur; domain hiçbir Expo/SQLite/UI API'sini import etmez. DB şema değişikliği ayrı R2 review ve migration round-trip testi gerektirir.

## 7. Geliştirme sırası ve kanıt

1. VDY-003A: Saf TypeScript date ordinal, Euclidean mod, cycle projection, override; `tests/fixtures/shift-cycle-cases.json` verisinden otomatik unit test. `T07` ve `T08` dahil.
2. VDY-003B: ShiftTemplate/ShiftCycle/override için SQLite v2 additive migration, CRUD ve gerçek SQLite adapter testleri; silme/rollback/idempotence ve future-version guard.
3. VDY-003C: Bugün/Takvim okuma entegrasyonu, 180+ gün gezinme, hafta/ay/year; **cihaz ekran testi ayrı kapı**.

Başarı kapısı: `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `git diff --check`, bağımsız R2 reviewer (DB/model etkisi varsa), PROGRESS güncellemesi. **Burada bu komutlar çalıştırılmadı; fixture bir test raporu değil.**

## 8. Açık sınırlar / sorular

- Ücret/çalışma/payroll sınıfları bu döngünün görevi değil; OFF ile gerçek işyeri hafta tatili bir tutulmamalı.
- Eşit start/end saatleri için otomatik 24h plan yaratılmıyor; kullanıcıya açık validation gösterilecek.
- Bu sözleşme **saf plan motorunun ilk teknik önerisi**. `PRODUCT_SPEC.md`, anayasa v1.1 veya eski VDY-002 commit'lerini değiştirmez. R2/R3 gerektiren ürün/migration değişikliğinde Codex reviewer ve kurucu kapısı uygulanır.
