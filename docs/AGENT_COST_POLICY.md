# Vardiyam — Düşük Kredi Tüketimli Çok Ajan Politikası v0.1

**Durum:** Geliştirme harness önerisi; `PROJECT_CONSTITUTION.md v1.0` ve `AGENTS.md` ile uyumlu. Kredi harcaması sayısal olarak garanti edilemez: sağlayıcı/model, bağlam boyutu ve gerçek kullanım değişir. Bu belge pahalı tekrarları ve gereksiz delegasyonu sınırlar.

## 1. Varsayılan ekip: 2 gerçek alt ajan

- **Koordinatör (ana Codex oturumu):** görevi küçültür, ilgili dosyaları seçer, beceriyi yükler, kabul kriterini yazar, ilerlemeyi tutar; ürün kodunu mümkün olduğunca alt ajana bırakır.
- **Ajan A — uygulayıcı:** yalnız hedef dosyalar + testler; kısa patch ve kanıt.
- **Ajan B — bağımsız reviewer:** yalnız diff + ilgili anayasa maddesi + acceptance + test çıktısı; dosya düzenlemez. Kritik bulgular varsa A düzeltir, B yalnız değişen kısmı tekrar kontrol eder.

**Anayasa gereği iki gerçek alt ajan şarttır.** Sadece koordinatörün iki rolü canlandırması kabul edilmez. Üçüncü ajan varsayılan olarak açılmaz. Hukuk/para/veri güvenliği gibi P0/P1 riskinde gerekçeyle ek uzman ajan açılabilir; onay gerektiren maliyet artışını kullanıcıya bildir.

## 2. Maliyet sınırları

1. **Mikro görevler:** 0,5–1 gün ve mümkünse 1–5 dosya. Bir ekran + DB + IAP gibi geniş paketler ayrı task.
2. **Bir plan, bir uygulama, bir review:** Aynı görevi çoklu ajana paralel çözdürüp en iyisini seçme; aynı diff için 3–4 reviewer açma.
3. **Önce yerel araç:** `git diff`, `rg`, test, TypeScript ve resmi docs; belirsiz sürüm yoksa Context7 sorgulama.
4. **Hedefli bağlam:** Koordinatör bağlayıcı belgeleri okur; alt ajana görev, ilgili madde/dosya ve test beklentisini ver. Repo'nun tamamını her ajan mesajına kopyalama. Alt ajan kendi ortamında ilgili belgeleri açabilir.
5. **Kısa çıktı:** Uygulayıcı değişen dosyalar + test sonuçları + risk; reviewer P0–P3 bulgu listesi veya 'kritik bulgu yok' + incelediği patch SHA. Uzun günlükleri yalnız hata varsa paylaş.
6. **En fazla bir otomatik düzeltme turu:** Aynı hata devam ederse STOP, `BLOCKED` ve `NEXT ACTION` kaydı. Sonsuz agent ping-pong yok.
7. **Araç çağrısı yalnız ihtiyaçta:** UI Skills sadece UI, Context7 sadece sürüm/API belirsizliği, Graphify yalnız somut kod bağımlılığı incelemesi ve kimliği doğrulanırsa. Deep research/Strix gibi ağır işler opt-in.
8. **Model yönlendirmesi:** Ortamda gerçekten sunulan düşük maliyetli model/effort seçeneği varsa dar dokümantasyon, grep ve basit test görevinde kullan. Hesap, migration, güvenlik ve kritik UX kararında yeterli akıl yürütme seviyesini koru. **Desteklenmeyen model adlarını `.codex/config.toml` içine yazma; gerçek `codex --help` / sürüm dokümanı ile doğrula.**
9. **Bütçe görünürlüğü:** Task raporuna `Agent çağrısı sayısı`, `MCP sorgu sayısı`, `tekrar turu` ve kullanıcıya görünüyorsa gerçek kredi/token kullanımı yaz. Kullanım bilgisi yoksa 'ölçülemedi' de; tahminleri fatura gibi gösterme.

## 3. Alt ajan sandbox sorunu için gerçek çözüm

- Önce reviewer'ın repo çalışma dizinine erişebildiğini **salt okunur** testle doğrula: `pwd`/`Get-Location`, `git rev-parse --show-toplevel`, hedef dosyayı okuma.
- Ayrı sandbox depoya erişemiyorsa, reviewer'a koordinatör tarafından **tam ve güncel, kişisel verisiz diff + ilgili test çıktısı + etkilenen dosyaların gerekli kesitleri** aktarılabilir; reviewer kendi değerlendirmesini yapar.
- Yalnız diff'le yapılan inceleme `PATCH_ONLY_REVIEW` olarak işaretlenir; repo genelinde inceleme yapıldığı iddia edilmez.
- Patch dahi verilemiyorsa `BLOCKED_REVIEW_UNAVAILABLE`; bağımsız review yapılmış sayılmaz. Sessizce reviewer rolünü koordinatör üstlenmez.
- `git diff --check`, test çıktısı ve patch SHA review kanıtının parçasıdır.

## 4. Risk yönlendirmesi

| Risk | Uygulayıcı | Reviewer | Ek kontrol |
|---|---|---|---|
| Doküman/araç | Genel ajan | Kısa diff reviewer | Git ve araç doğrulaması |
| Takvim/UX | UI ajanı | UX/a11y reviewer | UI Skills + gerçek cihaz sonra |
| Mesai/para | Domain ajanı | Hesap reviewer | Fixture ve regresyon zorunlu |
| SQLite/yedek | Data ajanı | Security reviewer | Migration/restore round-trip |
| Release/IAP | Release ajanı | Güvenlik/mağaza reviewer | Sandbox, cihaz ve kurucu kapısı |

## 5. Görev istemi şablonu

```text
TASK: VDY-XXX (tek amaç)
KURALLAR: PROJECT_CONSTITUTION.md + AGENTS.md + ilgili repo skill
HEDEF: [kabul kriteri]
DOKUNULABİLİR DOSYALAR: [...]
DOKUNULMAYACAKLAR: [...]
KANIT: [komut/test/screenshot]
MALİYET: 1 implementer + 1 bağımsız reviewer; ek ajan yok; tek düzeltme turu
STOP: belirsiz yetki, dış veri paylaşımı, kırık git worktree, P0/P1
RAPOR: dosyalar, gerçek PASS/FAIL/SKIP, reviewer, NEXT ACTION
```

**Hedef:** daha az tekrar ve daha küçük bağlam; güvenlik ve hesap doğruluğu kapılarından taviz değil.
