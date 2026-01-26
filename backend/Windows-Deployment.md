# Backend Deployment Guide (Docker)

Bu rehber, backend'i Docker kullanarak herhangi bir Windows veya Linux sunucusuna kurmak için gereken adımları içerir.

## 1. Hazırlık
Sunucuda şu yazılımların kurulu olduğundan emin olun:
- **Docker Desktop** (Windows için) veya **Docker Engine** (Linux için)
- **Git**

## 2. Kurulum
1. Projeyi sunucuya çekin:
   ```powershell
   git clone https://github.com/trivagotr/rtjukebox.git
   cd rtjukebox/backend
   ```
2. `.env` dosyasını oluşturun (örnek dosyadan kopyalayarak):
   ```powershell
   copy .env.example .env
   # .env içindeki şifreleri ve gizli anahtarları güncellemeyi unutmayın!
   ```

## 3. Başlatma
Sistemi tek bir komutla ayağa kaldırın:
```powershell
docker-compose up -d --build
```

Bu komut şunları yapar:
- PostgreSQL 15 veritabanını kurar ve `schema.sql`'i içeri aktarır.
- Redis 7 önbellek servisini kurar.
- Backend uygulamasını derler ve çalıştırır.

## 4. Sorun Giderme
Konteyner durumlarını kontrol etmek için:
```powershell
docker ps
```
Logları incelemek için:
```powershell
docker-compose logs -f app
```

## 5. Dış Erişime Açma
- Sunucu güvenliği için Windows Firewall üzerinden `3000` portuna izin verin.
- Üretim ortamında Nginx gibi bir Reverse Proxy kullanılması önerilir.
