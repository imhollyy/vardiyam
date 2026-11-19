# VDY-010A — Ana Ekran UI/UX Yenilemesi

## Kapsam

- Ana ekrana yerel olarak saklanan açık/koyu tema, tarih/saat üst barı, bildirim/profil menüleri, haftalık vardiya özeti ve aylık takvim eklendi.
- Mesai başlatma, UTC başlangıcını ayrı `active_work_sessions` kaydında saklar; bitirme, mevcut WorkRecord repository'sinde kayıt ve oturum kapanışını aynı işlem kuyruğu/transaction içinde tamamlar.
- Günlük izin/rapor/gidilmedi açıklamaları `work_day_statuses` tablosunda kalır; kazanç veya hukuki sınıflandırma oluşturmaz. Tamamlandı işareti mevcut WorkRecord'dan türetilir.
- Gün paneli vardiya tipini (SHIFT/OFF/LEAVE), vardiya şablonunu ve şablon başlangıç/bitiş saatlerini mevcut override repository'siyle kaydeder; “Düzeni kullan” seçeneği cycle override'ını kaldırır. Fiilî kayıt ve süre farkı görünür; kayıt düzenlemesi mevcut WorkRecord ekranına yönlenir.
- SQLite v7 additive migration; v1–v6 tablolarını yeniden kurmaz. Yedek schema doğrulaması v7 tablolarını kapsar.

## Sınırlar ve kabul notları

- Ücret, mesai, ödeme, vardiya döngüsü veya WorkRecord doğrulama kuralları yeniden yazılmadı.
- Günlük plan saati mevcut vardiya şablonlarından seçilir; yeni serbest biçimli per-day saat override modeli eklenmedi.
- Bildirimler için uygulamada mevcut bir bildirim servisi olmadığından menü boş durum gösterir.
- Gerçek cihaz, büyük yazı, TalkBack ve görsel açık/koyu tema kabulü bu teslimatta çalıştırılmadı; cihaz kabul listesinde takip edilir.

## Doğrulama

- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm test`: PASS, 256/256; v1–v7 yedek şema kontrolleri, v6→v7 koruma, tema tercihi, aktif oturumun kalıcılığı/atomik tamamlanması, silinen plan bağlantısıyla tamamlama ve durum anotasyonları dahil.
- `npx expo-doctor --verbose`: 18/20; iki ağ gerektiren metadata kontrolü DNS/servis yanıtı nedeniyle tamamlanmadı. Paket uyumluluğu ve yerel kontroller geçti.
- Android JS export: Hermes bytecode üretimi `hermesc` exit 6 ile başarısız oldu; `--no-bytecode` ile Android bundle PASS, 1.255 modül.
- `git diff --check`: PASS (yalnız Windows satır sonu uyarıları).
- Android/iOS gerçek cihaz görsel kabulü: NOT RUN.
- Bağımsız R2 veri güvenliği incelemesi: APPROVE; P0/P1/P2 yok. İlk P1 plan silinince oturumun bitirilememesi bulgusu, snapshot korunup eksik FK kimlikleri null yazılarak kapatıldı. İlk P2 tarih kısıtı notu da v7 SQL tarih sınırlarının gün/ay/yıl kontrolüyle sıkılaştırıldı.
- Bağımsız UI/erişilebilirlik statik incelemesi: P0–P2 bulgusu kalmadı. Cihaz/TalkBack/büyük yazı doğrulaması statik incelemeden ayrı olarak NOT RUN.

## Sonraki kabul turu

Küçük ekran ve büyük yazıda taşma; açık/koyu tema tercihini yeniden açılışta koruma; TalkBack etiket/sıra; haftalık kart ve gün göstergeleri; başlat/bitir ve manuel saat; gece yarısı/DST; gün panelinden SHIFT/OFF/LEAVE ve vardiya şablonu saatlerini kaydetme, düzeni geri alma, not kaydı; çevrimdışı hata/boş durumları ve alt gezinme görünürlüğü doğrulanmalı.

## Kapanış doğrulaması — 2026-11-05

- Hermes: önceki `hermesc exit 6` hatasının kök nedeni bulunamadı; bu turdaki tek odaklı, bytecode açık Android export aynı dalda başarıyla tamamlandı. 1.255 modül bundle edildi ve `.hbc` (3.3 MB) üretildi. Hata tekrarlanmadığından kalıcı kod/yapılandırma sorunu kanıtlanmadı; geçici neden varsayımı kesin bulgu değildir.
- `npm run typecheck`: PASS; `npm run lint`: PASS; `npm test`: PASS, 256/256; `npx expo-doctor --verbose`: PASS, 20/20; `git diff --check`: PASS.
- Expo Doctor'ın önceki 18/20 sonucu uzaktaki metadata kontrollerinin tamamlanmamasına aitti. Bu turda 20 kontrolün tamamı geçti; bağımlılık sürümü değiştirilmedi.
- SQLite migration testleri tam test paketinde PASS; v6→v7 koruması ve v1–v7 yedek şema kontrolleri dahil.
- Gerçek uygulama web önizlemesi SQLite web WASM/COOP/COEP yapılandırması bulunmadığından açılmadı. Fiziksel Android/iOS ekran doğrulaması ve gerçek ekran görüntüsü NOT RUN. Sunulan beş panelli tasarım yalnızca MOCKUP'tır, uygulama kanıtı değildir.
- Otomatik testler tema tercihinin varsayılan açık olmasını ve yerel kalıcılığını, session repository akışını, atomik bitişi ve geceye uzayan tarih kuralını kapsıyor. Görsel start/finish geçişi, tema yeniden açılışı, küçük ekran/büyük yazı, TalkBack, panel ve alt tab görünürlüğü cihazda kabul edilmedi.
- Bağımsız UI/erişilebilirlik incelemesi önceki statik onayı koruyor; native erişilebilirlik doğrulaması ayrıca NOT RUN. GitHub CI, draft PR açıldıktan sonra yeni commit için bekleniyor.

- **Bağımsız UI/a11y final review:** APPROVE; statik P0/P1/P2 yok. İncelemede bulunan 44 dp altı butonlar güncellendi; takvim hücrelerine hitSlop eklendi. Gün paneli açıkken ana içerik erişilebilirlik ağacından gizleniyor, sheet modal olarak işaretli; haftalık gün etiketleri tam gün adı, vardiya adı ve başlangıç/bitiş saatini içeriyor. Android TalkBack/VoiceOver ve gerçek ekran doğrulaması yine NOT RUN.

- **GitHub teslimatı:** Draft PR #29 (`https://github.com/imhollyy/vardiyam/pull/29`), `feat/vdy-010a-home-ui` → `feat/vdy-008-backup-restore-data-wipe`; commit `f39e318bbd19816f00a3e590dfe5d2ae71619176`. GitHub Actions CI run #36 (`42106943665`) PASS; typecheck, lint, unit tests, Expo dependency health ve workflow tamamlandı.
