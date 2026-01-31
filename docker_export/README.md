# Docker Import Talimatları

Bu klasördeki dosyaları yeni bilgisayarınızda Docker ortamını hızlıca kurmak için kullanabilirsiniz.

## 1. İmajları Yükleme
Önce kaydedilmiş Docker imajlarını sisteme geri yükleyin:
```bash
docker load -i docker_images.tar
```

## 2. Veritabanını Geri Yükleme
Docker-compose ile veritabanını ayağa kaldırdıktan sonra dump dosyasını içeri aktarın:

1. Önce servisleri başlatın:
   ```bash
   docker-compose up -d db
   ```
2. Veritabanı dump dosyasını yükleyin:
   ```bash
   cat database_dump.sql | docker exec -i backend-db-1 psql -U radiotedu_user -d radiotedu
   ```

## Notlar
- Proje klasöründeki `.env` dosyasının yeni bilgisayarda da mevcut olduğundan emin olun.
- `uploads` klasörünün de taşındığından emin olun, çünkü kullanıcı yüklemeleri orada tutuluyor.
