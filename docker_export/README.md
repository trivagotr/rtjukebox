# Docker Import Talimatları

Bu klasördeki dosyalar, Docker ortamını yeni bir bilgisayarda hızlıca geri kurmak için kullanılır.

## 1. İmajları Yükleme
Önce kaydedilmiş Docker imajlarını sisteme geri yükleyin:
```powershell
docker load -i docker_images.tar
```

## 2. Veritabanını Geri Yükleme
PowerShell metin pipe'ı kullanmayın. `Get-Content` veya `cat` ile SQL dump'ı aktarırken dosya baytları yeniden yorumlanabilir ve UTF-8 içeriği bozulabilir.

1. Önce servisleri başlatın:
   ```powershell
   docker-compose up -d db
   ```
2. Dry-run ile restore komutunu doğrulayın:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\restore-database.ps1 -DumpPath .\database_dump.sql -WhatIf
   ```
3. Gerçek geri yükleme için `-WhatIf` parametresini kaldırın:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\restore-database.ps1 -DumpPath .\database_dump.sql
   ```

Betik dump dosyasını container'a kopyalar, `psql -f` ile çalıştırır ve `PGCLIENTENCODING=UTF8` ayarlar. Dump verisi PowerShell üzerinden akmaz.

İhtiyaç olursa hedef container, veritabanı kullanıcısı ve veritabanı adı için parametreleri geçebilirsiniz:
```powershell
powershell -ExecutionPolicy Bypass -File .\restore-database.ps1 `
  -DumpPath .\database_dump.sql `
  -ContainerName backend-db-1 `
  -DatabaseUser radiotedu_user `
  -DatabaseName radiotedu
```

## Notlar
- Proje klasöründeki `.env` dosyasının yeni bilgisayarda da mevcut olduğundan emin olun.
- `uploads` klasörünün de taşındığından emin olun, çünkü kullanıcı yüklemeleri orada tutuluyor.
