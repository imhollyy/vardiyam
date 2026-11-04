# Vardiyam — Kısa Geliştirme Yol Haritası

**Tahmin:** 25–35 aktif geliştirme günü, yaklaşık 5–7 hafta tek geliştirici+Codex temposu; mağaza inceleme/kapalı test bekleme süresi buna eklenebilir. Kesin teslim tarihi değildir. Kapsam büyürse tarih değil kapsam küçültülür.

| Kapı | Tahmini aktif gün | Çıktı | Geçiş şartı |
|---|---:|---|---|
| G0 — Anayasa ve harness | 1–2 | constitution PR, AGENTS, skills, ilerleme, görev | kurucu onayı, agent/skill erişim testi |
| G1 — Mobil iskelet ve vardiya | 5–7 | Expo scaffold, theme, SQLite migration, onboarding, vardiya döngüsü | typecheck/lint/test + UI review |
| G2 — Çalışma ve mesai motoru | 7–9 | WorkRecord, mola, tatil, segmentasyon, kural sürümü | 30–40 hesap fixture'ı + bağımsız QA |
| G3 — Kazanç, ödeme, veri | 5–7 | brüt ayrıntı, bordro neti, ödeme, backup/restore, Pro sandbox | para doğruluğu, veri bütünlüğü |
| G4 — Görsel kalite ve pilot | 5–7 | 4 ekran polish, erişilebilirlik, 20–50 pilot kullanıcının geri bildirimi | gerçek Android+iOS cihaz, 0 P0/P1 |
| G5 — Mağaza adayı | 2–3 | gizlilik metinleri, store listing, RC, rollback | kurucu + hukuk uzmanı onayı |

## Sprint politikası

- Her görev **0,5–2 gün** ölçeğinde; büyük görev parçalanır.
- Aynı anda en fazla 2 aktif task; kritik hesap motorunda tek yazar.
- Önce test fixture -> domain -> UI -> cihaz doğrulaması.
- Her gün/oturum sonunda `docs/progress/PROGRESS.md` güncelle.
- Mağaza onayı, kapalı test ve satın alma hesapları için erken hazırlık yap; bekleme süresini en sona bırakma.

## İlk görevler

1. **VDY-001** — Kurucu anayasa onayı, alt ajan ve beceri keşfi, Codex local ortamı, Expo sürümü doğrulama.
2. **VDY-002** — Expo scaffold, strict TS, Expo Router, lint/test/CI, design tokens, boş 4 sekme.
3. **VDY-003** — SQLite migration + vardiya template/cycle/domain testleri.
4. **VDY-004** — Plan ve fiilî çalışma UI/DB ayrımı.
5. **VDY-005** — Hesap motoru kural öncelikleri ve tatil segmentasyonu.
6. **VDY-006** — Kazanç/net ödeme mutabakatı.
7. **VDY-007** — Güvenli backup/restore ve silme.
8. **VDY-008** — Pro/IAP + restore.
9. **VDY-009** — Tasarım/erişilebilirlik ve pilot.
10. **VDY-010** — Store RC + hukuk/gizlilik kontrolü.

## Scope kill-switch

G2 sonunda hesap motoru güvenilir değilse Pro/PDF/analiz ertelenir; hesap doğruluğu asla ertelenmez. G4'te gerçek cihaz yoksa mağaza adayı oluşturulmaz. Hukuki doğrulama yoksa uygulama kesin hakediş/bordro iddiasında bulunmaz.
