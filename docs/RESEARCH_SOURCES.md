# Vardiyam — Araştırma Kaynakları ve Doğrulama Notları

**Derin araştırma raporu tarihi:** 2026-11-05. Bu liste mevzuatın, mağaza kurallarının ve rakiplerin **yayın anındaki durumunu garanti etmez**. Kod ve mağaza gönderimi öncesi birincil kaynakları yeniden doğrula.

## İş hukuku ve tatiller — birincil kaynaklar

- [4857 sayılı İş Kanunu — ÇSGB PDF](https://www.csgb.gov.tr/Media/crldhi51/4857-say%C4%B1l%C4%B1-i%C5%9F-kanunu.pdf): genel çalışma süresi, fazla çalışma, fazla sürelerle çalışma, UBGT ve hafta tatili çerçevesi. Özellikle ilgili maddeler ve yürürlükteki değişiklikler hukuk uzmanıyla kontrol edilir.
- [ÇSGB — İş Kanunu sık sorulan sorular](https://www.csgb.gov.tr/sikca-sorulan-sorular/calisma-genel-mudurlugu/%C4%B1s-kanunu/): 45 saat, ara dinlenme, denkleştirme, fazla çalışma açıklamaları.
- [ÇSGB — Dinlenme hakkı broşürü](https://www.csgb.gov.tr/Media/rcwbjlbh/bros-u-r-dinlenme-hakk%C4%B1.pdf): hafta tatili ve dinlenme.
- [2429 sayılı Ulusal Bayram ve Genel Tatiller Hakkında Kanun](https://vakithesaplama.diyanet.gov.tr/2429_kanun.php): tam/yarım gün tatil kapsamı.
- [Diyanet — 2026 resmî tatil takvimi](https://vakithesaplama.diyanet.gov.tr/icerik.php?icerik=158): yıllık tarih kontrolü; her yıl yeni sürüm gerekir.
- [Resmî Gazete — 4857 sayılı Kanunun ilk yayımlanışı](https://www.resmigazete.gov.tr/eskiler/2003/06/20030610.htm): tarihî metin; güncel konsolide metinle karşılaştır.
- [SGK — 2026 prim oranları](https://www.sgk.gov.tr/Content/Post/c7812ea8-5087-413f-aeb5-d3c1d153e11a/Isveren-Prim-Oranlari-2026-01-13-04-52-38) ve [GİB — gelir vergisi mevzuatı](https://gib.gov.tr/mevzuat/kanun/433/madde/6937): otomatik kesin net maaş hesabının neden MVP dışında tutulduğu.

**Hukuk karar notu:** Kullanıcının +%50 / +%100 / +%100 tercihleri 'işyeri varsayılanı' olarak sunulur. Hafta sonu yasal hafta tatiliyle aynı değildir. UBGT çalışması ve fazla mesai çakışmalarında farklı yorum/uygulama olabilir; uzman doğrulaması olmadan kesin hak iddiası yoktur.

## Rakipler — mağaza sayfaları

- [Supershift](https://apps.apple.com/us/app/supershift-shift-calendar/id1104165041): rotasyon, offline, rapor, ücret.
- [My Shift Planner](https://apps.apple.com/us/app/my-shift-planner-calendar/id645662133): vardiya planı, mesai, ücret.
- [Mesai Pusulam](https://apps.apple.com/tr/app/mesai-pusulam-mesai-hesaplama/id6815601696): Türkiye'ye özgü mesai oranları ve gerçek net ödeme karşılaştırması.
- [Mesaipro](https://apps.apple.com/tr/app/mesaipro-maa%C5%9F-ve-mesai/id6742710334): özel maaş dönemi, oranlar, ek gelir/kesinti, export.
- [Vardiya Takvimi](https://play.google.com/store/apps/details?hl=tr&id=com.vardiya.takvimi.tr): Türkiye pazarında vardiya takvimi örneği.

**Konumlandırma:** 'Yalnız +%50/+%100 hesaplama' tek başına rakip üstünlüğü değildir. Fark: açıklanabilir satır bazlı hesap, geçmiş kural sürümü, plan/gerçek ayrımı, gerçek net ödeme mutabakatı ve yüksek kaliteli offline UX.

## Teknik, tasarım, gizlilik ve mağaza

- [Android offline-first mimari](https://developer.android.com/topic/architecture/data-layer/offline-first).
- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/); şifreleme varsayma.
- [Expo FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/); güvenli export için ayrıca kripto/bütünlük çözümü gerekir.
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).
- [Apple In-App Purchase](https://developer.apple.com/in-app-purchase/).
- [Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/).
- [Google Play target API gereklilikleri](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en); yayın tarihinde yeniden kontrol.
- [Google Play yeni kişisel hesap test gereklilikleri](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en-AU-u-fw-mon-mu-celsius); hesabın açılış tarihine/türüne göre doğrula.
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/accessibility).
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/).
- [KVKK veri güvenliği yükümlülükleri](https://www.kvkk.gov.tr/Icerik/2040/Veri-Guvenligine-Iliskin-Yukumlulukler).
- [KVKK mobil uygulamalar rehberi](https://kvkk.gov.tr/SharedFolderServer/CMSFiles/8ba209bb-fa93-4479-84f0-dd55aac97a0f.pdf).
- [KVKK aydınlatma yükümlülüğü](https://www.kvkk.gov.tr/Icerik/2033/Aydinlatma-Yukumlulugu-).

## Codex geliştirme düzeni

- Tam Kare'nin gerçek depo belgeleri: `imhollyy/tam-kare` içinde `AGENTS.md`, `PROJECT_CONSTITUTION.md`, `.codex/config.toml`, `docs/development-quality-tooling.md`. Bu özel depo dokümanlarının içerikleri Vardiyam'ın public deposuna aynen kopyalanmamıştır.
- [OpenAI — Repo-local skills ve AGENTS.md](https://developers.openai.com/blog/skills-agents-sdk): `.agents/skills/<skill>/SKILL.md` yaklaşımı.
- [OpenAI — Codex geliştirme iş akışı](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex): kalıcı bağlam ve doğrulama.
- Harici Context7/UI Skills MCP yapılandırması Tam Kare'den **uyarlandı**; Vardiyam'da gerçekten erişilebilirliği henüz test edilmedi.

## Kaynak doğrulama görevi

VDY-005 öncesi hesaplama ajanı hukuk/mesai kaynaklarını tarih ve maddeyle yeniden doğrular; yayın öncesi uzman incelemesi ayrı kapıdır. VDY-010 öncesi mağaza ve gizlilik kuralları yeniden kontrol edilir. Her kaynak değişikliği `docs/DECISIONS.md` ve kural sürümüne bağlanır.
