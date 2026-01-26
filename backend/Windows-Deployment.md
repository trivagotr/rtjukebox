# Windows Server Deployment Guide (RDP)

Bu rehber, backend'i bir Windows sunucusuna kurmak için gereken adımları içerir.

## 1. Hazırlık (Sunucu İçinde)

RDP ile bağlandığınız sunucuda şu yazılımların kurulu olduğundan emin olun:
- **Node.js (v20+):** [nodejs.org](https://nodejs.org/)
- **PostgreSQL (v15+):** [postgresql.org](https://www.postgresql.org/download/windows/)
- **Redis for Windows:** [Redis-Windows](https://github.com/tporadowski/redis/releases) (veya Docker kullanıyorsanız Docker Desktop)
- **Git:** [git-scm.com](https://git-scm.com/download/win)

## 2. Proje Kurulumu

Bir terminal (PowerShell/CMD) açın:

```powershell
# Projeyi çekin (veya dosyaları kopyalayın)
cd C:\inetpub\wwwroot\
git clone https://github.com/your-repo/rtmusicbox.git
cd rtmusicbox\backend

# Bağımlılıkları yükleyin
npm install

# .env dosyasını oluşturun ve düzenleyin
copy .env.example .env
# Not: .env içindeki şifreleri sunucunuza göre güncelleyin
```

## 3. Veritabanı Yapılandırması

PostgreSQL (pgAdmin veya psql) üzerinden `radiotedu` adında bir veritabanı oluşturun ve `src/db/schema.sql` dosyasındaki SQL komutlarını çalıştırın.

## 4. Uygulamayı Derleme (Build)

```powershell
npm run build
```

## 5. Arka Planda Çalıştırma (PM2)

Uygulamanın sunucu kapansa bile çalışmaya devam etmesi için PM2 kullanacağız:

```powershell
# PM2 yükleyin
npm install -g pm2

# Başlatın
pm2 start ecosystem.config.js --env production

# Kaydedin (Sunucu restart olduğunda otomatik açılması için)
pm2 save
pm2 startup
```

## 6. Güvenlik ve Port Açma

- Windows Firewall üzerinden `3000` portuna (veya seçtiğiniz porta) gelen istekleri kabul etmek için bir "Inbound Rule" ekleyin.
- Dışarıya 80/443 (SSL) üzerinden açmak için **Nginx for Windows** veya **IIS Reverse Proxy** kullanmanız önerilir.
