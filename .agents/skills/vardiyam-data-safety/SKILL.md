---
name: vardiyam-data-safety
description: Use when changing SQLite migrations, personal pay data, backup/restore, deletion, logs, SDK data flow, or privacy disclosures.
---

# Vardiyam Data Safety — v1.0

1. Kişisel veri akışını çıkar: hangi veri, hangi yerel tablo, hangi dış servis, hangi izin?
2. SQLite'ın varsayılan olarak şifreli olduğunu varsayma. Cihaz sandbox'ı ile şifreli export farklı güvenlik özellikleridir.
3. Migration'ı versiyonlu, geri alınabilir/ileri uyumlu ve veri korumalı yap. Silme veya overwrite öncesi kullanıcı onayı ve yedek.
4. Backup/restore için format sürümü, checksum/bütünlük, parolalı şifreleme uygulaması (gerçek kütüphane doğrulaması), atomik restore, bozuk dosya ve yanlış parola testleri gerekir.
5. Gerçek maaş, bordro, banka detayı, kişisel veri, secret ve token test fixture/log/crash/analytics/PR içine girmez.
6. Public repo, harici MCP/LLM, hata takip SDK'sı, reklam/analitik sağlayıcısı için veri paylaşımı incelemesi; onaysız aktarım yok.
7. Kullanıcı veri silme ve ücretsiz veri taşıma yeteneği; export'ta paylaşım uyarısı.
8. KVKK aydınlatma ve açık rıza mekanizmalarını ayrı değerlendir; hukuk uzmanı yerine geçme.
9. Bağımsız security reviewer + migration/restore test kanıtı olmadan kritik veri görevi Done olmaz.
10. PROGRESS ve RISKS güncelle; üretim verisi veya canlı secret üzerinde deney yapma.
