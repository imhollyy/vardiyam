# VDY-001 — Windows Git 'must be run in a work tree' teşhis ve güvenli kurtarma

**Önemli:** Bu hata `git rev-parse` çalışırken `git status`un hata vermesiyle uyumludur; kesin kök neden henüz bilinmiyor. Sık nedenler: bare repo, `GIT_DIR`/`GIT_WORK_TREE` ortam değişkenleri, bozuk `.git` worktree bağlantısı veya yanlış dizin.

**Yasak:** `git init`, `git reset --hard`, `git clean -fd`, zorla branch değiştirme, mevcut klasörü silme veya mevcut `PROGRESS.md` dosyasını üstüne yazma.

## A. Önce yalnız salt-okunur teşhis (PowerShell)

```powershell
Set-Location 'C:\Users\emrey\vardiyam'
Get-Location
Get-Item -Force .git -ErrorAction SilentlyContinue | Format-List FullName,Mode,LinkType,Target
Get-ChildItem Env:GIT* | Select-Object Name,Value
git --version
git rev-parse --is-bare-repository
git rev-parse --is-inside-work-tree
git rev-parse --show-toplevel
git rev-parse --git-dir
git config --show-origin --get core.bare
git config --show-origin --get core.worktree
git status --short --branch
```

Komut hata verse bile diğerlerini çalıştır. Çıktıyı paylaşırken gizli token/credential olabilecek ortam değişkeni değerlerini sansürle. `PROGRESS.md` içeriğini kaybetme.

## B. Eğer GIT_DIR / GIT_WORK_TREE dışarıdan set edilmişse

Yalnız mevcut PowerShell oturumunda geçici temizle, **diskte değişiklik yapma**:

```powershell
Remove-Item Env:GIT_DIR -ErrorAction SilentlyContinue
Remove-Item Env:GIT_WORK_TREE -ErrorAction SilentlyContinue
Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue
git rev-parse --is-inside-work-tree
git status --short --branch
```

`true` + başarılı status beklenir. Çalışmıyorsa başka nedeni araştır.

## C. Eğer bare repo veya bozuk .git ise

**Önce yerel değişiklikleri güvenli kopyala.** Özellikle Codex'in yazdığı `docs/progress/PROGRESS.md` ve başka uncommitted dosyalar korunmalı. Ayrı, yeni klasöre klonla:

```powershell
Set-Location 'C:\Users\emrey'
git clone https://github.com/imhollyy/vardiyam.git vardiyam-clean
Set-Location '.\vardiyam-clean'
git rev-parse --is-inside-work-tree
git status --short --branch
```

Eski klasörü **silme**. Eski ve yeni dosyaları karşılaştır; yerel ilerleme günlüğünü uygun yere elle birleştir. `git clone` komutunu mevcut `vardiyam` klasörünün üzerine çalıştırma. Yeni klasörde Git başarılıysa Codex'in çalışma klasörünü oraya yönlendir.

## D. Reviewer sandbox erişimi

Reviewer ayrı sandbox'ta depoyu göremiyorsa:
1. Salt-okunur erişim testi yap: çalışma dizini, `git rev-parse --show-toplevel`, hedef dosya.
2. Erişim yoksa koordinatör **güncel ve redakte edilmiş diff** + acceptance + test çıktısını reviewer'a iletsin.
3. Gerçek reviewer bu patch'i incelerse `PATCH_ONLY_REVIEW` olarak raporla. Diff de yoksa `BLOCKED_REVIEW_UNAVAILABLE`.
4. Reviewer'a gereksiz yazma, GitHub token veya üretim verisi erişimi verme.

## E. Başarı ölçüsü

```text
git rev-parse --is-inside-work-tree -> true
git rev-parse --is-bare-repository -> false
git status --short --branch -> exit 0
branch -> chore/vdy-001-codex-preflight (ancak mevcut değişiklikler korunduktan sonra)
local PROGRESS.md -> korunmuş ve yeni branch'e doğru şekilde aktarılmış
reviewer -> repo veya patch inceleme kanıtı
```

**Git düzeldi diye VDY-001 DONE olmaz:** UI Skills gerçek araç/CLI çağrısı ve alt ajan incelemesi ayrıca doğrulanır. Expo'nun henüz kurulmamış olması tek başına preflight engeli değildir.
