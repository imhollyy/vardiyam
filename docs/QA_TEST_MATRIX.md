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
| P35 | Aylık brüt için saat böleni önerisi | 225 saat düzenlenebilir işyeri profili önerisi olarak görünür; açık kullanıcı onayı olmadan hiçbir hesap bu değeri kullanmaz |
| P36 | Saat böleni değişikliği | yeni sürüm gelecekteki hesaplara uygulanır; önceki onaylı CalculationSnapshot değişmez |
| P37 | Aynı dakikada birden fazla farklı katsayılı kural | geçerli en yüksek tek katsayı bir kez seçilir ve açıklanır; oranlar toplanmaz; aynı katsayılı eşit adaylarda uyarı + manuel düzeltme sunulur |

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
| GitHub CI | PENDING | Draft PR #11 head `f9e174ae5e25ae9cf1b3da1e257ebcbdaad1a541`; Actions CI run 41997473336 was IN_PROGRESS at first poll. Record terminal status in progress log. |
| Android/iOS physical visual QA, large text and screen reader | SKIP | Not required by this task; native UI behavior is not claimed as device-verified. Existing VDY-003B Android/SQLite screenshots remain preserved above. |

Reviewer: independent R2 reviewer **APPROVE** after fixes; first review caught and the implementation addressed a saved-phase regression risk, 44 dp touch target gaps, and missing editable IANA zone. Final reviewer verified DayCell `hitSlop` correction. Keep R08 (iOS/device coverage), R13 (12 moderate audit findings), and Ethernet Public-profile policy issue separate and open.
