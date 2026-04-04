# RadioTEDU - Security & Deployment

## Güvenlik

### HTTPS & Reverse Proxy

**Caddy önerisi** (Windows'ta en kolay SSL):

```Caddyfile
api.radiotedu.com {
    reverse_proxy localhost:3000
}

stream.radiotedu.com {
    reverse_proxy localhost:8000
}
```

Caddy otomatik Let's Encrypt sertifikası alır.

### JWT Güvenliği

```typescript
// Access token: 15 dakika
const accessToken = jwt.sign(
  { userId, email },
  process.env.JWT_SECRET,
  { expiresIn: '15m' }
);

// Refresh token: 30 gün, rotate on use
const refreshToken = jwt.sign(
  { userId, tokenId: uuid() },
  process.env.JWT_REFRESH_SECRET,
  { expiresIn: '30d' }
);
```

### Rate Limiting
```typescript
import rateLimit from 'express-rate-limit';

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
});
```

### OWASP Basics
- Helmet.js for HTTP headers
- CORS whitelist
- Input validation (Zod)
- SQL injection prevention (parameterized queries)
- XSS prevention (sanitize HTML)

---

## Windows Server Deployment

### 1. Node.js Kurulumu
```powershell
# Node.js LTS indir ve kur
# PM2 global kur
npm install -g pm2
pm2 install pm2-windows-service
pm2-service-install
```

### 2. Uygulama Deployment
```powershell
cd C:\apps\radiotedu-backend
npm ci --production
pm2 start ecosystem.config.js
pm2 save
```

### 3. ecosystem.config.js
```javascript
module.exports = {
  apps: [{
    name: 'radiotedu-api',
    script: 'dist/server.js',
    instances: 2,
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      DATABASE_URL: 'postgresql://...',
      REDIS_URL: 'redis://localhost:6379'
    }
  }]
};
```

### 4. Caddy Kurulumu
```powershell
choco install caddy
# Caddyfile'ı C:\Caddy\Caddyfile'a koy
caddy run --config C:\Caddy\Caddyfile
```

---

## CI/CD (GitHub Actions)

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - run: npm test
      - name: Deploy to server
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /apps/radiotedu-backend
            git pull
            npm ci --production
            npm run build
            pm2 restart radiotedu-api
```

---

## Backup & Monitoring

### PostgreSQL Backup
```powershell
# Daily backup script
$date = Get-Date -Format "yyyy-MM-dd"
pg_dump -U postgres radiotedu > "C:\backups\radiotedu-$date.sql"
```

### PostgreSQL Restore
PowerShell text pipe kullanmayın. SQL dump'ı `Get-Content` veya `cat` ile boru hattından geçirmek, dump baytlarını yeniden yorumlayıp UTF-8 karakterleri bozabilir.
Restore işleminden önce DB container'ı çalışıyor olmalıdır; `backend-db-1`, `radiotedu_user` ve `radiotedu` bu ortam için varsayılan değerlerdir.

```powershell
powershell -ExecutionPolicy Bypass -File .\docker_export\restore-database.ps1 -DumpPath .\docker_export\database_dump.sql -WhatIf
```

Dry-run çıktısı doğru görünüyorsa `-WhatIf` olmadan çalıştırın. Gerekirse `-ContainerName`, `-DatabaseUser` ve `-DatabaseName` parametreleriyle hedefi geçersiniz.

### Monitoring
- PM2 built-in monitoring: `pm2 monit`
- Uptime Kuma (self-hosted)
- Log rotation with pm2-logrotate

---

## Milestones

### MVP (8 hafta)
| Hafta | Görev |
|-------|-------|
| 1-2 | Backend setup, Auth, DB |
| 3-4 | Live Radio, Podcast API |
| 5-6 | Jukebox core |
| 7 | Push notifications |
| 8 | Test, Deploy |

### V2
- Offline podcast download
- Admin dashboard
- Analytics dashboard
- Multi-kiosk support
