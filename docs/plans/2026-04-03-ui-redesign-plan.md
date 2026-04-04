# RadioTEDU Jukebox UI Redesign — Kiosk + Admin Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Radikal görsel yenileme — kiosk ve admin dashboard'u radiotedu.com marka kimliğiyle hizalayarak Albert Sans fontu, zenginleştirilmiş renk sistemi (#E31E26 kırmızı + #F36A07 turuncu) ve sinematik animasyonlarla yeniden tasarlamak; hiçbir buton veya özellik kaldırılmadan.

**Architecture:** İki bağımsız frontend (kiosk-web vanilla HTML/CSS/JS, jukebox-web-controller React/Tailwind) ayrı ayrı güncellenir. Ortak tasarım sistemi her iki projede de CSS değişkenleri aracılığıyla uygulanır. Mevcut tüm JavaScript mantığı ve React bileşen yapısı korunur — sadece CSS/HTML/JSX görsel katmanı değiştirilir.

**Tech Stack:** Vanilla CSS (kiosk), Tailwind CSS + inline styles (admin), Albert Sans (Google Fonts), CSS custom properties, CSS keyframe animations

---

## Ortak Tasarım Sistemi

### Renk Paleti (radiotedu.com'dan türetildi)

```
Birincil:
  --red:        #E31E26   (RadioTEDU ana kırmızı)
  --red-light:  #FF4757   (hover/vurgu)
  --red-dark:   #C0392B   (gölge/derinlik)
  --orange:     #F36A07   (ikincil vurgu — ana siteden alındı)
  --orange-dim: rgba(243,106,7,0.15)

Arka plan:
  --bg-base:    #0B0B0F   (temel — önceki #0a0a0f'ten biraz daha sıcak)
  --bg-surface: #131318   (kartlar için)
  --bg-lift:    #1A1A22   (hover/active durumlar)

Metin:
  --text-1:  #FFFFFF
  --text-2:  rgba(255,255,255,0.70)
  --text-3:  rgba(255,255,255,0.40)

Sınır:
  --border:  rgba(255,255,255,0.06)
  --border-bright: rgba(255,255,255,0.12)

Durum:
  --green:   #10B981
  --blue:    #3B5BFF
```

### Tipografi

**Albert Sans** — radiotedu.com ile birebir eşleşen font.
Google Fonts import:
```html
<link href="https://fonts.googleapis.com/css2?family=Albert+Sans:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
```

Hiyerarşi:
```
Display (kiosk başlıklar):  900 weight, -0.03em letter-spacing
Heading 1:  800 weight, -0.02em
Heading 2:  700 weight, -0.01em
Label:      700 weight, 0.08em letter-spacing, uppercase
Body:       400 weight, normal
Caption:    600 weight, 0.05em, uppercase, --text-3
```

### Gürültü Dokusu (Noise Texture)

Her iki projede de arka plana ince bir film granı dokusu eklenir. CSS ile:
```css
body::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  opacity: 0.025;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  background-size: 256px 256px;
}
```

### Gradient Orbs Güncellemesi

Her iki projede de orb renkleri güncellenir. Kırmızı + turuncu kombinasyonu:
```css
.orb-1 { background: radial-gradient(circle, #E31E26 0%, transparent 70%); }
.orb-2 { background: radial-gradient(circle, #F36A07 0%, transparent 70%); }  /* YENİ: turuncu */
.orb-3 { background: radial-gradient(circle, #C0392B 0%, transparent 70%); }
```

---

## BÖLÜM 1: KIOSK REDESIGN (kiosk-web/)

**Etkilenen dosyalar:**
- `kiosk-web/index.html` — font linki, yapısal HTML
- `kiosk-web/style.css` — tüm CSS

---

### Task 1: Font + CSS Tokens (Kiosk)

**Dosyalar:**
- Modify: `kiosk-web/index.html`
- Modify: `kiosk-web/style.css`

- [ ] **Adım 1: index.html — Font linkini Albert Sans ile değiştir**

`<head>` içindeki mevcut Outfit font satırını bulup şununla değiştir:
```html
<link href="https://fonts.googleapis.com/css2?family=Albert+Sans:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
```

- [ ] **Adım 2: style.css — :root değişkenlerini güncelle**

Mevcut `:root` bloğunu tamamen şununla değiştir:
```css
:root {
  /* RadioTEDU Marka Renkleri */
  --red:          #E31E26;
  --red-light:    #FF4757;
  --red-dark:     #C0392B;
  --orange:       #F36A07;
  --orange-dim:   rgba(243, 106, 7, 0.15);
  --orange-glow:  rgba(243, 106, 7, 0.25);
  --green:        #10B981;
  --blue:         #3B5BFF;

  /* Arka Plan */
  --bg-base:      #0B0B0F;
  --bg-surface:   #131318;
  --bg-lift:      #1A1A22;

  /* Geçişler (legacy uyum) */
  --bg-primary:      var(--bg-base);
  --bg-secondary:    var(--bg-surface);
  --bg-card:         rgba(19, 19, 24, 0.88);
  --bg-card-hover:   rgba(26, 26, 34, 0.92);
  --accent-red:      var(--red);
  --accent-red-light: var(--red-light);
  --accent-red-dark: var(--red-dark);
  --accent-green:    var(--green);

  /* Gradyanlar */
  --gradient-primary: linear-gradient(135deg, var(--red) 0%, var(--red-light) 100%);
  --gradient-accent:  linear-gradient(135deg, var(--red) 0%, var(--red-dark) 100%);
  --gradient-orange:  linear-gradient(135deg, var(--orange) 0%, #FF8C42 100%);
  --gradient-hero:    linear-gradient(152deg, var(--red) 0%, var(--orange) 100%);

  /* Metin */
  --text-primary:   #ffffff;
  --text-secondary: rgba(255, 255, 255, 0.70);
  --text-muted:     rgba(255, 255, 255, 0.40);

  /* Cam Efekti */
  --glass-bg:     rgba(255, 255, 255, 0.03);
  --glass-border: rgba(255, 255, 255, 0.06);
  --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  --border:       rgba(255, 255, 255, 0.06);
  --border-bright: rgba(255, 255, 255, 0.12);

  /* Yarıçaplar */
  --radius-sm: 12px;
  --radius-md: 20px;
  --radius-lg: 28px;
  --radius-xl: 40px;

  /* Font */
  --font-family: 'Albert Sans', -apple-system, BlinkMacSystemFont, sans-serif;
}
```

- [ ] **Adım 3: Gürültü dokusu ekle**

`style.css` dosyasında reset bloğundan önce ekle:
```css
body::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 9998;
  pointer-events: none;
  opacity: 0.025;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  background-size: 256px 256px;
}
```

- [ ] **Adım 4: Orb-2'yi turuncu yap**

Mevcut `.orb-2` kuralını güncelle:
```css
.orb-2 {
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, var(--orange) 0%, transparent 70%);
  bottom: -150px;
  right: -100px;
  animation-delay: -7s;
}
```

- [ ] **Adım 5: Tarayıcıda test et — font değişti mi, renkler doğru mu**

Kiosk'u `http://localhost:3000/kiosk` adresinde aç. Albert Sans ve turuncu orb görünmeli.

- [ ] **Adım 6: Commit**
```bash
git add kiosk-web/index.html kiosk-web/style.css
git commit -m "design: kiosk — Albert Sans font + updated design tokens"
```

---

### Task 2: Header Yenileme (Kiosk)

**Dosyalar:**
- Modify: `kiosk-web/style.css` — `.header` ve alt seçiciler
- Modify: `kiosk-web/index.html` — markup değişikliği yok, sadece CSS

Hedef: Header daha sıkışık ve odaklı görünmeli. Sol: logo + konum. Sağ: canlı göstergesi + bağlantı + çıkış. Turuncu-kırmızı gradient şerit header'ın altına eklenir.

- [ ] **Adım 1: Header container stilini güncelle**

```css
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 36px;
  background: rgba(11, 11, 15, 0.85);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-bottom: 1px solid var(--border);
  position: relative;
  z-index: 10;
}

/* Kırmızı→turuncu gradient alt çizgi */
.header::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--red) 0%, var(--orange) 60%, transparent 100%);
  opacity: 0.8;
}
```

- [ ] **Adım 2: Logo stilini güncelle**

```css
.logo {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 40px;
}

.brand-logo {
  display: block;
  width: auto;
  height: 38px;
  max-width: 200px;
  object-fit: contain;
  filter: drop-shadow(0 4px 12px rgba(227, 30, 38, 0.35));
  transition: filter 0.3s ease;
}

.brand-logo:hover {
  filter: drop-shadow(0 4px 20px rgba(227, 30, 38, 0.55));
}
```

- [ ] **Adım 3: Konum rozeti stilini güncelle**

Konum rozeti (device-badge) şu an düz cam. Kırmızı sol border + ince parlak kenarlık:
```css
.device-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(227, 30, 38, 0.08);
  border: 1px solid rgba(227, 30, 38, 0.20);
  border-left: 2px solid var(--red);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.02em;
}

.device-badge .material-symbols-rounded {
  font-size: 16px;
  color: var(--red);
}
```

- [ ] **Adım 4: CANLI göstergesi stilini güncelle**

Daha dramatik: turuncu ışıltılı dot + kırmızı metin + gradient arka plan:
```css
.live-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 16px;
  background: linear-gradient(135deg, rgba(227,30,38,0.15) 0%, rgba(243,106,7,0.10) 100%);
  border: 1px solid rgba(227, 30, 38, 0.25);
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--red-light);
}

.live-dot {
  width: 7px;
  height: 7px;
  background: var(--orange);
  border-radius: 50%;
  box-shadow: 0 0 8px var(--orange);
  animation: pulse-live 1.4s ease-in-out infinite;
}

@keyframes pulse-live {
  0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 8px var(--orange); }
  50%       { opacity: 0.6; transform: scale(1.3); box-shadow: 0 0 14px var(--orange); }
}
```

- [ ] **Adım 5: Bağlantı rozetini güncelle**

```css
.connection-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--glass-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  transition: all 0.2s ease;
}

.connection-badge.connected {
  border-color: rgba(16, 185, 129, 0.25);
  background: rgba(16, 185, 129, 0.06);
}

.connection-badge.connected .material-symbols-rounded {
  color: var(--green);
}

.connection-badge.error {
  border-color: rgba(239, 68, 68, 0.25);
}
```

- [ ] **Adım 6: Çıkış butonunu güncelle**

```css
.logout-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
  margin-left: 8px;
}

.logout-btn:hover {
  background: rgba(227, 30, 38, 0.12);
  border-color: rgba(227, 30, 38, 0.35);
  color: var(--red-light);
  transform: scale(1.05);
}
```

- [ ] **Adım 7: Tarayıcıda doğrula**

Header gradient çizgisi, turuncu live dot, güncellenmiş rozetler görünmeli.

- [ ] **Adım 8: Commit**
```bash
git add kiosk-web/style.css
git commit -m "design: kiosk — header gradient bar, live indicator, badges"
```

---

### Task 3: Idle State Yenileme (Kiosk)

**Dosyalar:**
- Modify: `kiosk-web/style.css`
- Modify: `kiosk-web/index.html` — idle-state içine 5 ek ses-bar elementi

Hedef: Boş vinyl yerine daha çekici bir "bekleme ekranı". Büyük gradient yazı + animasyonlu ses spektrumu + radioTEDU öne çıkarma.

- [ ] **Adım 1: index.html — idle-state içeriğini güncelle**

Mevcut `.idle-state` div içeriğini şununla değiştir (JS `idleState` id'si korunuyor):
```html
<div class="idle-state" id="idleState">
  <!-- Spektrum Animasyonu -->
  <div class="idle-spectrum">
    <span></span><span></span><span></span><span></span>
    <span></span><span></span><span></span><span></span>
    <span></span><span></span><span></span><span></span>
    <span></span><span></span><span></span><span></span>
    <span></span><span></span><span></span><span></span>
  </div>

  <!-- Logo merkezde -->
  <div class="idle-logo-wrap">
    <div class="idle-logo-ring"></div>
    <div class="idle-logo-inner">
      <span class="material-symbols-rounded">music_note</span>
    </div>
  </div>

  <h1 class="idle-title">Müzik <span class="idle-title-accent">Bekliyor</span></h1>
  <p class="idle-subtitle">QR kodu okutarak şarkı ekleyin!</p>

  <!-- Alt bilgi bandı -->
  <div class="idle-tag">
    <span class="material-symbols-rounded">qr_code_scanner</span>
    <span>Telefonunu çıkar, kodu tara</span>
  </div>
</div>
```

- [ ] **Adım 2: style.css — idle spektrum barları**

```css
.idle-spectrum {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: 5px;
  height: 80px;
  margin-bottom: 40px;
}

.idle-spectrum span {
  width: 5px;
  border-radius: 3px;
  background: linear-gradient(to top, var(--red) 0%, var(--orange) 100%);
  animation: idle-bar 2.4s ease-in-out infinite;
  transform-origin: bottom;
}

/* Her bara farklı yükseklik ve gecikme */
.idle-spectrum span:nth-child(1)  { height: 20px; animation-delay: 0.00s; }
.idle-spectrum span:nth-child(2)  { height: 45px; animation-delay: 0.10s; }
.idle-spectrum span:nth-child(3)  { height: 30px; animation-delay: 0.20s; }
.idle-spectrum span:nth-child(4)  { height: 60px; animation-delay: 0.05s; }
.idle-spectrum span:nth-child(5)  { height: 35px; animation-delay: 0.30s; }
.idle-spectrum span:nth-child(6)  { height: 70px; animation-delay: 0.15s; }
.idle-spectrum span:nth-child(7)  { height: 25px; animation-delay: 0.25s; }
.idle-spectrum span:nth-child(8)  { height: 55px; animation-delay: 0.08s; }
.idle-spectrum span:nth-child(9)  { height: 80px; animation-delay: 0.35s; }
.idle-spectrum span:nth-child(10) { height: 45px; animation-delay: 0.12s; }
.idle-spectrum span:nth-child(11) { height: 65px; animation-delay: 0.22s; }
.idle-spectrum span:nth-child(12) { height: 30px; animation-delay: 0.40s; }
.idle-spectrum span:nth-child(13) { height: 50px; animation-delay: 0.18s; }
.idle-spectrum span:nth-child(14) { height: 75px; animation-delay: 0.28s; }
.idle-spectrum span:nth-child(15) { height: 40px; animation-delay: 0.06s; }
.idle-spectrum span:nth-child(16) { height: 55px; animation-delay: 0.32s; }
.idle-spectrum span:nth-child(17) { height: 25px; animation-delay: 0.42s; }
.idle-spectrum span:nth-child(18) { height: 45px; animation-delay: 0.16s; }
.idle-spectrum span:nth-child(19) { height: 35px; animation-delay: 0.38s; }
.idle-spectrum span:nth-child(20) { height: 20px; animation-delay: 0.48s; }

@keyframes idle-bar {
  0%, 100% { transform: scaleY(0.25); opacity: 0.4; }
  50%       { transform: scaleY(1);    opacity: 1; }
}
```

- [ ] **Adım 3: style.css — idle logo çemberi**

```css
.idle-logo-wrap {
  position: relative;
  width: 120px;
  height: 120px;
  margin: 0 auto 32px;
}

.idle-logo-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid transparent;
  background: linear-gradient(var(--bg-base), var(--bg-base)) padding-box,
              linear-gradient(135deg, var(--red), var(--orange)) border-box;
  animation: spin-slow 6s linear infinite;
}

.idle-logo-inner {
  position: absolute;
  inset: 12px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--red) 0%, var(--orange) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 40px rgba(227, 30, 38, 0.4), 0 0 80px rgba(243, 106, 7, 0.2);
}

.idle-logo-inner .material-symbols-rounded {
  font-size: 42px;
  color: white;
}
```

- [ ] **Adım 4: style.css — idle başlık ve alt etiket**

```css
.idle-title {
  font-size: 52px;
  font-weight: 900;
  letter-spacing: -0.03em;
  color: var(--text-primary);
  margin-bottom: 12px;
  line-height: 1.1;
}

.idle-title-accent {
  background: linear-gradient(135deg, var(--red) 0%, var(--orange) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.idle-subtitle {
  font-size: 17px;
  color: var(--text-muted);
  font-weight: 500;
  margin-bottom: 28px;
}

.idle-tag {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 22px;
  background: rgba(243, 106, 7, 0.10);
  border: 1px solid rgba(243, 106, 7, 0.22);
  border-radius: 40px;
  font-size: 13px;
  font-weight: 700;
  color: var(--orange);
  letter-spacing: 0.03em;
}

.idle-tag .material-symbols-rounded {
  font-size: 18px;
}
```

- [ ] **Adım 5: Eski vinyl CSS'i kaldır veya gizle**

Stil dosyasında `.vinyl-disc`, `.vinyl-label` sınıfları artık idle state'te kullanılmıyor — bunları silebilirsin (playing state'te de kullanılmıyor).

- [ ] **Adım 6: Tarayıcıda doğrula**

Idle ekranında spektrum barları animasyonlu görünmeli, logo çemberi dönmeli, başlıkta gradient vurgu olmalı.

- [ ] **Adım 7: Commit**
```bash
git add kiosk-web/index.html kiosk-web/style.css
git commit -m "design: kiosk — animated idle spectrum, gradient logo ring"
```

---

### Task 4: Now Playing Hero — Çalan Durumu (Kiosk)

**Dosyalar:**
- Modify: `kiosk-web/style.css`

Hedef: Album kapağı daha büyük (360px), daha dramatik glow efekti, şarkı başlığı daha büyük ve cesur, sanatçı adı turuncu vurguyla.

- [ ] **Adım 1: Album container ve art stilini güncelle**

```css
.album-container {
  position: relative;
  width: 360px;
  height: 360px;
  margin: 0 auto;
  z-index: 1;
}

.album-art {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: var(--radius-lg);
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.08),
    0 30px 60px rgba(0,0,0,0.7),
    0 0 120px rgba(227,30,38,0.25);
  transition: box-shadow 0.5s ease;
}
```

- [ ] **Adım 2: Glow efektini dramatikleştir**

```css
.album-glow {
  position: absolute;
  inset: -60px;
  background: radial-gradient(circle, var(--red) 0%, var(--orange) 40%, transparent 70%);
  opacity: 0.35;
  filter: blur(50px);
  z-index: 0;
  animation: pulse-glow 3s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%, 100% { opacity: 0.35; transform: scale(1); }
  50%       { opacity: 0.55; transform: scale(1.08); }
}
```

- [ ] **Adım 3: vinyl-edge görsel iyileştirme**

```css
.vinyl-edge {
  position: absolute;
  top: 50%;
  right: -70px;
  width: 130px;
  height: 130px;
  background: conic-gradient(from 0deg, #1C1C26, #0F0F17, #1C1C26, #0F0F17);
  border-radius: 50%;
  transform: translateY(-50%);
  z-index: -1;
  animation: spin-slow 4s linear infinite;
  box-shadow:
    inset 0 0 20px rgba(0,0,0,0.7),
    0 0 20px rgba(0,0,0,0.4);
}

.vinyl-edge::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 22px;
  height: 22px;
  background: linear-gradient(135deg, var(--red), var(--orange));
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 10px rgba(243,106,7,0.5);
}
```

- [ ] **Adım 4: Şarkı detayları — tipografiyi güncelle**

```css
.song-details {
  margin-bottom: 28px;
}

.now-playing-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 18px;
  background: linear-gradient(135deg, rgba(227,30,38,0.15) 0%, rgba(243,106,7,0.10) 100%);
  border: 1px solid rgba(227, 30, 38, 0.25);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  margin-bottom: 20px;
  color: var(--red-light);
  text-transform: uppercase;
}

.now-playing-badge .material-symbols-rounded {
  font-size: 14px;
  color: var(--orange);
}

.song-title {
  font-size: 44px;
  font-weight: 900;
  letter-spacing: -0.03em;
  margin-bottom: 10px;
  line-height: 1.1;
  color: var(--text-primary);
}

.song-artist {
  font-size: 22px;
  font-weight: 600;
  color: var(--orange);
  margin-bottom: 16px;
  letter-spacing: -0.01em;
}

.requester-info {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 16px;
  background: rgba(16, 185, 129, 0.10);
  border: 1px solid rgba(16, 185, 129, 0.20);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--green);
}
```

- [ ] **Adım 5: Ses dalgaları güncelle — gradient + daha fazla bar**

```css
.sound-waves {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: 5px;
  height: 36px;
  margin-top: 18px;
}

.sound-waves span {
  width: 5px;
  background: linear-gradient(to top, var(--red) 0%, var(--orange) 100%);
  border-radius: 3px;
  animation: wave 1.2s ease-in-out infinite;
  transform-origin: bottom;
}

.sound-waves span:nth-child(1) { height: 18px; animation-delay: 0.0s; }
.sound-waves span:nth-child(2) { height: 32px; animation-delay: 0.1s; }
.sound-waves span:nth-child(3) { height: 24px; animation-delay: 0.2s; }
.sound-waves span:nth-child(4) { height: 36px; animation-delay: 0.15s; }
.sound-waves span:nth-child(5) { height: 14px; animation-delay: 0.05s; }

@keyframes wave {
  0%, 100% { transform: scaleY(0.35); }
  50%       { transform: scaleY(1); }
}
```

- [ ] **Adım 6: Progress bar güncelle**

```css
.waveform-progress {
  position: relative;
  height: 52px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  margin-bottom: 10px;
}

.progress-overlay {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg,
    rgba(227,30,38,0.25) 0%,
    rgba(243,106,7,0.20) 100%
  );
  transition: width 0.1s linear;
}

/* Progress bar'ın sağ kenarına parlayan çizgi */
.progress-overlay::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 2px;
  height: 100%;
  background: linear-gradient(to bottom, var(--orange), var(--red));
  box-shadow: 0 0 8px var(--orange);
}

.time-display {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
  letter-spacing: 0.04em;
}
```

- [ ] **Adım 7: Tarayıcıda doğrula**

Sanatçı adı turuncu, album kapağı daha büyük ve glow'lu, progress bar kenarında parlayan çizgi görünmeli.

- [ ] **Adım 8: Commit**
```bash
git add kiosk-web/style.css
git commit -m "design: kiosk — hero album art, orange artist, progress glow"
```

---

### Task 5: QR Kartı Yenileme (Kiosk)

**Dosyalar:**
- Modify: `kiosk-web/style.css`

Hedef: QR kartı daha belirgin, kenarlarda köşe aksanları, daha net "tara" çağrısı.

- [ ] **Adım 1: QR kartı container**

```css
.qr-card {
  background: var(--bg-card);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--border-bright);
  border-radius: var(--radius-lg);
  padding: 24px 20px;
  text-align: center;
  position: relative;
  overflow: hidden;
}

/* Sol üst köşe aksan */
.qr-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 60px;
  height: 3px;
  background: linear-gradient(90deg, var(--red), transparent);
  border-radius: 0 0 3px 0;
}

/* Sağ alt köşe aksan */
.qr-card::after {
  content: '';
  position: absolute;
  bottom: 0;
  right: 0;
  width: 60px;
  height: 3px;
  background: linear-gradient(270deg, var(--orange), transparent);
  border-radius: 3px 0 0 0;
}
```

- [ ] **Adım 2: QR header**

```css
.qr-header {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 16px;
  color: var(--text-secondary);
}

.qr-header .material-symbols-rounded {
  font-size: 20px;
  color: var(--orange);
}
```

- [ ] **Adım 3: QR kod kutucuğu**

```css
.qr-code {
  background: white;
  padding: 12px;
  border-radius: 16px;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 190px;
  min-height: 190px;
  border: none;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}

.qr-code canvas {
  display: block;
  border-radius: 8px;
}

/* Köşe işaretçileri — QR tarayıcı efekti */
.qr-container {
  position: relative;
  display: inline-block;
}

.qr-container::before,
.qr-container::after {
  content: '';
  position: absolute;
  width: 22px;
  height: 22px;
  border-color: var(--red);
  border-style: solid;
}

.qr-container::before {
  top: -6px;
  left: -6px;
  border-width: 3px 0 0 3px;
  border-radius: 4px 0 0 0;
}

.qr-container::after {
  bottom: -6px;
  right: -6px;
  border-width: 0 3px 3px 0;
  border-radius: 0 0 4px 0;
}

.qr-pulse {
  position: absolute;
  inset: -8px;
  border: 1.5px solid rgba(227, 30, 38, 0.5);
  border-radius: 18px;
  opacity: 0;
  animation: qr-pulse-anim 2.5s ease-out infinite;
}

@keyframes qr-pulse-anim {
  0%   { opacity: 0.5; transform: scale(0.97); }
  100% { opacity: 0; transform: scale(1.08); }
}

.qr-hint {
  margin-top: 14px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.04em;
}
```

- [ ] **Adım 4: Tarayıcıda doğrula**

QR kartında köşe çizgileri, turuncu ikon, kırmızı pulse efekti görünmeli.

- [ ] **Adım 5: Commit**
```bash
git add kiosk-web/style.css
git commit -m "design: kiosk — QR card corner accents, scanner effect"
```

---

### Task 6: Kuyruk Kartı Yenileme (Kiosk)

**Dosyalar:**
- Modify: `kiosk-web/style.css`

Hedef: Sıra kartı daha okunaklı, numaralar daha belirgin, hover efekti daha akıcı.

- [ ] **Adım 1: Kuyruk kartı container**

```css
.queue-card {
  flex: 1;
  background: var(--bg-card);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--border-bright);
  border-radius: var(--radius-lg);
  padding: 22px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.queue-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--red) 40%, var(--orange) 70%, transparent);
  opacity: 0.6;
}
```

- [ ] **Adım 2: Kuyruk başlığı**

```css
.queue-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}

.queue-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.queue-title .material-symbols-rounded {
  font-size: 20px;
  color: var(--red);
}

.queue-badge {
  background: linear-gradient(135deg, var(--red), var(--orange));
  padding: 3px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 800;
  color: white;
  min-width: 28px;
  text-align: center;
}
```

- [ ] **Adım 3: Kuyruk öğesi**

```css
.queue-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border);
  border-radius: 14px;
  margin-bottom: 10px;
  transition: all 0.25s ease;
  cursor: default;
}

.queue-item:hover {
  background: rgba(227, 30, 38, 0.06);
  border-color: rgba(227, 30, 38, 0.20);
  transform: translateX(4px);
}

.queue-position {
  width: 30px;
  height: 30px;
  background: linear-gradient(135deg, var(--red), var(--orange));
  border-radius: 8px;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 13px;
  font-weight: 800;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(227,30,38,0.3);
}

.queue-song-info {
  flex: 1;
  min-width: 0;
}

.queue-song-title {
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 3px;
  color: var(--text-primary);
}

.queue-song-artist {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.queue-votes {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  background: rgba(16, 185, 129, 0.10);
  border: 1px solid rgba(16, 185, 129, 0.20);
  border-radius: 20px;
  font-size: 13px;
  font-weight: 700;
  color: var(--green);
  flex-shrink: 0;
}

.queue-votes.negative {
  background: rgba(239, 68, 68, 0.10);
  border-color: rgba(239, 68, 68, 0.20);
  color: #EF4444;
}
```

- [ ] **Adım 4: Boş kuyruk stili**

```css
.empty-queue {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 160px;
  color: var(--text-muted);
  gap: 8px;
}

.empty-queue .material-symbols-rounded {
  font-size: 48px;
  opacity: 0.15;
  color: var(--orange);
}

.empty-queue p {
  font-size: 15px;
  font-weight: 700;
  opacity: 0.5;
}

.empty-hint {
  font-size: 12px;
  opacity: 0.3;
  font-weight: 500;
}
```

- [ ] **Adım 5: Tarayıcıda doğrula**

Kuyruk kartında üst gradient çizgi, numara rozetleri gradient, hover efekti görünmeli.

- [ ] **Adım 6: Commit**
```bash
git add kiosk-web/style.css
git commit -m "design: kiosk — queue card gradient accents, item hover polish"
```

---

### Task 7: Sayfa Giriş Animasyonları (Kiosk)

**Dosyalar:**
- Modify: `kiosk-web/style.css`

Hedef: `.playing-state` ve `.idle-state` için staggered giriş animasyonu. Sayfanın yüklenmesinde bileşenler sıralı beliriyor.

- [ ] **Adım 1: fadeInUp animasyonunu güncelle ve iyileştir**

```css
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeInScale {
  from {
    opacity: 0;
    transform: scale(0.94);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.idle-state {
  text-align: center;
  animation: fadeInUp 0.7s cubic-bezier(0.22, 1, 0.36, 1);
}

/* Idle elemanlarının kademeli girişi */
.idle-spectrum  { animation: fadeInUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.1s both; }
.idle-logo-wrap { animation: fadeInScale 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both; }
.idle-title     { animation: fadeInUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.35s both; }
.idle-subtitle  { animation: fadeInUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.45s both; }
.idle-tag       { animation: fadeInUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.55s both; }

.playing-state  { animation: fadeInUp 0.7s cubic-bezier(0.22, 1, 0.36, 1); }

/* Side panel kademeli giriş */
.qr-card    { animation: fadeInUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both; }
.queue-card { animation: fadeInUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.30s both; }
```

- [ ] **Adım 2: Commit**
```bash
git add kiosk-web/style.css
git commit -m "design: kiosk — staggered entrance animations"
```

---

## BÖLÜM 2: ADMIN DASHBOARD REDESIGN (jukebox-web-controller/)

**Etkilenen dosyalar:**
- `jukebox-web-controller/src/index.css` — design tokens, utility classes
- `jukebox-web-controller/src/App.css` — varsa ek stiller
- `jukebox-web-controller/src/App.tsx` — JSX sınıf değişiklikleri (Tailwind)
- `jukebox-web-controller/src/AdminDashboard.tsx` — admin panel JSX

---

### Task 8: Font + CSS Tokens (Admin)

**Dosyalar:**
- Modify: `jukebox-web-controller/src/index.css`
- Not: Tailwind config güncellenmesi GEREKMİYOR — custom properties üzerinden çalışılacak.

- [ ] **Adım 1: index.css — Albert Sans import ekle**

Dosyanın en başına ekle:
```css
@import url('https://fonts.googleapis.com/css2?family=Albert+Sans:wght@300;400;500;600;700;800;900&display=swap');
```

- [ ] **Adım 2: :root tokens güncelle**

Mevcut `:root` bloğunu tamamen şununla değiştir:
```css
:root {
  font-family: 'Albert Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color-scheme: dark;
  color: #ffffff;
  background-color: #0B0B0F;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  /* RadioTEDU Marka */
  --primary:          #E31E26;
  --primary-hover:    #FF4757;
  --primary-glow:     rgba(227, 30, 38, 0.30);
  --gradient-primary: linear-gradient(135deg, #E31E26 0%, #FF4757 100%);
  --secondary:        #C0392B;

  /* Orange — radiotedu.com ikincil renk */
  --orange:           #F36A07;
  --orange-hover:     #FF8C42;
  --orange-dim:       rgba(243, 106, 7, 0.12);
  --orange-glow:      rgba(243, 106, 7, 0.25);
  --gradient-orange:  linear-gradient(135deg, #F36A07 0%, #FF8C42 100%);

  /* Arka plan */
  --background:       #0B0B0F;
  --surface:          #131318;
  --surface-hover:    #1A1A22;

  /* Durum */
  --green:            #10B981;
  --blue:             #3B5BFF;

  /* Cam efekti */
  --glass-bg:         rgba(19, 19, 24, 0.65);
  --glass-border:     rgba(255, 255, 255, 0.07);
  --border:           rgba(255, 255, 255, 0.06);
  --border-bright:    rgba(255, 255, 255, 0.12);

  /* Metin */
  --text-muted:       rgba(255, 255, 255, 0.45);
}
```

- [ ] **Adım 3: Gürültü dokusu ekle**

```css
body::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  opacity: 0.022;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  background-size: 256px 256px;
}
```

- [ ] **Adım 4: Orb-2'yi turuncu yap**

```css
.orb-2 {
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, var(--orange) 0%, transparent 70%);
  bottom: -150px;
  right: -100px;
  animation-delay: -7s;
}
```

- [ ] **Adım 5: btn-primary güncelle**

```css
.btn-primary {
  background: var(--gradient-primary);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 12px;
  font-family: 'Albert Sans', sans-serif;
  box-shadow: 0 4px 16px rgba(227, 30, 38, 0.25);
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-hover);
  transform: translateY(-2px);
  box-shadow: 0 8px 28px var(--primary-glow);
}

.btn-primary:active:not(:disabled) {
  transform: translateY(0);
}
```

- [ ] **Adım 6: input-field güncelle**

```css
.input-field {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-bright);
  border-radius: 10px;
  padding: 12px 16px;
  color: white;
  width: 100%;
  box-sizing: border-box;
  outline: none;
  transition: all 0.2s ease;
  font-family: 'Albert Sans', sans-serif;
  font-weight: 500;
  font-size: 14px;
}

.input-field:focus {
  border-color: var(--primary);
  background: rgba(255, 255, 255, 0.06);
  box-shadow: 0 0 0 3px rgba(227, 30, 38, 0.12);
}

.input-field::placeholder {
  color: var(--text-muted);
  font-weight: 400;
}
```

- [ ] **Adım 7: card güncelle**

```css
.card {
  background: var(--surface);
  border-radius: 18px;
  padding: 20px;
  border: 1px solid var(--border);
}
```

- [ ] **Adım 8: Tarayıcıda doğrula — :5173 adresinde font Albert Sans, turuncu orb görünmeli**

- [ ] **Adım 9: Commit**
```bash
git add jukebox-web-controller/src/index.css
git commit -m "design: admin — Albert Sans font, orange token, updated utilities"
```

---

### Task 9: Login Ekranı Yenileme (Admin)

**Dosyalar:**
- Modify: `jukebox-web-controller/src/App.tsx` — `LoginView` component JSX

Hedef: Login ekranı daha dramatik. Büyük RadioTEDU logosu efekti, gradient arka plan aksanı, orange kullanımı.

- [ ] **Adım 1: LoginView JSX'inde üst logo bloğunu güncelle**

Mevcut `LoginView` içindeki logo bloğunu (satır 73-78 civarı) şununla değiştir:
```tsx
<div className="relative mb-8">
  {/* Arka glow */}
  <div className="absolute inset-0 blur-3xl opacity-20 rounded-full"
    style={{ background: 'linear-gradient(135deg, #E31E26, #F36A07)' }}
  ></div>
  <div
    className="relative w-20 h-20 rounded-[28px] flex items-center justify-center mx-auto shadow-2xl"
    style={{
      background: 'linear-gradient(135deg, #E31E26 0%, #F36A07 100%)',
      boxShadow: '0 20px 40px rgba(227,30,38,0.35), 0 0 0 1px rgba(255,255,255,0.08)'
    }}
  >
    <Music size={36} color="white" />
  </div>
</div>
```

- [ ] **Adım 2: Başlık ve alt yazıyı güncelle**

Mevcut `<h1>` ve `<p>` bloğunu şununla değiştir:
```tsx
<div className="mb-8">
  <h1 className="text-4xl font-black mb-2 tracking-tight">
    Jukebox<span style={{ color: 'var(--orange)' }}>.</span>
  </h1>
  <p style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '13px', letterSpacing: '0.05em' }}>
    TEDU kampüsünde müziği sen yönet
  </p>
</div>
```

- [ ] **Adım 3: Misafir giriş input'u güncelle — "Hızlı Başla" butonu turuncu olsun**

```tsx
<button
  onClick={handleGuestLogin}
  className="w-full py-4 font-black text-white rounded-xl transition-all hover:-translate-y-0.5 active:scale-95"
  style={{
    background: 'linear-gradient(135deg, #E31E26 0%, #F36A07 100%)',
    boxShadow: '0 8px 24px rgba(227,30,38,0.25)',
    fontSize: '13px',
    letterSpacing: '0.06em',
    textTransform: 'uppercase'
  }}
  disabled={loading}
>
  {loading ? 'Bağlanıyor...' : 'Hızlı Başla →'}
</button>
```

- [ ] **Adım 4: "Veya" ayraç stilini güncelle**

```tsx
<div className="flex items-center gap-4">
  <div className="flex-1 h-px" style={{ background: 'var(--border-bright)' }}></div>
  <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.12em' }}>VEYA</span>
  <div className="flex-1 h-px" style={{ background: 'var(--border-bright)' }}></div>
</div>
```

- [ ] **Adım 5: "Üye Girişi" butonunu güncelle**

```tsx
<button
  onClick={() => setShowLoginModal(true)}
  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all"
  style={{
    border: '1px solid var(--border-bright)',
    color: 'var(--text-muted)',
    fontSize: '12px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase'
  }}
  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(227,30,38,0.4)'; (e.currentTarget as HTMLElement).style.color = 'white'; }}
  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-bright)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
>
  <User size={14} /> Üye Girişi
</button>
```

- [ ] **Adım 6: Login modal'ı güncelle**

Modal içindeki başlık bloğunu güncelle:
```tsx
<div className="text-center mb-8">
  <h2 className="text-2xl font-black mb-1 tracking-tight">Üye Girişi</h2>
  <p style={{ fontSize: '10px', color: 'var(--orange)', fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase' }}>
    RadioTEDU Üyesi
  </p>
</div>
```

- [ ] **Adım 7: Cihaz kodu girişi — kullanıcı giriş yapmışsa**

Mevcut cihaz kodu bloğunu güncelle, buton turuncu gradient alıyor:
```tsx
<button
  onClick={() => connectToDevice(deviceCodeInput)}
  className="w-full py-4 font-black text-white rounded-xl transition-all uppercase tracking-wider"
  style={{
    background: 'linear-gradient(135deg, #E31E26 0%, #F36A07 100%)',
    boxShadow: '0 6px 20px rgba(227,30,38,0.25)',
    fontSize: '12px',
    letterSpacing: '0.08em'
  }}
  disabled={loading || !deviceCodeInput}
>
  Cihaza Bağlan
</button>
```

- [ ] **Adım 8: Tarayıcıda doğrula**

Login ekranında gradient logo, turuncu nokta başlıkta, turuncu giriş butonu görünmeli.

- [ ] **Adım 9: Commit**
```bash
git add jukebox-web-controller/src/App.tsx
git commit -m "design: admin login — gradient logo, orange accents, refined inputs"
```

---

### Task 10: Jukebox Görünümü — Sidebar (Admin)

**Dosyalar:**
- Modify: `jukebox-web-controller/src/App.tsx` — `JukeboxView` component sidebar div

Hedef: Sidebar'ın üst kısmı logo+cihaz bilgisi daha belirgin, arama kutusu daha rafine, kullanıcı bilgi kartı daha şık.

- [ ] **Adım 1: Sidebar container güncelle**

Mevcut sidebar div'ini (`lg:w-80 glass border-b lg:border-r ...`) güncelle:
```tsx
<div
  className="lg:w-80 border-b lg:border-r p-6 flex flex-col z-20 sticky top-0 lg:h-screen lg:shrink-0"
  style={{
    background: 'rgba(13,13,18,0.92)',
    backdropFilter: 'blur(28px)',
    borderColor: 'var(--border)',
    position: 'relative'
  }}
>
  {/* Üst gradient çizgi */}
  <div
    className="absolute top-0 left-0 right-0"
    style={{
      height: '2px',
      background: 'linear-gradient(90deg, #E31E26, #F36A07 50%, transparent)',
      opacity: 0.7
    }}
  ></div>
```

- [ ] **Adım 2: Logo + cihaz bilgisi bloğunu güncelle**

```tsx
<div className="flex items-center gap-3 mb-8">
  <div
    className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0"
    style={{
      background: 'linear-gradient(135deg, #E31E26, #F36A07)',
      boxShadow: '0 8px 20px rgba(227,30,38,0.3)'
    }}
  >
    <Music size={20} color="white" />
  </div>
  <div>
    <h1 className="font-black text-xl tracking-tight">
      Jukebox<span style={{ color: 'var(--orange)' }}>.</span>
    </h1>
    <div className="flex items-center gap-1.5 mt-0.5">
      <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></div>
      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {device?.name}
      </span>
    </div>
  </div>
</div>
```

- [ ] **Adım 3: Arama kutusu — sol ikon turuncu**

Mevcut Search ikonunu renklendirip border'ı parlat:
```tsx
<div className="relative mb-6">
  <Search
    className="absolute left-4 top-1/2 -translate-y-1/2"
    size={15}
    style={{ color: 'var(--orange)' }}
  />
  <input
    className="input-field pl-11 h-12"
    style={{ fontSize: '13px', fontWeight: 500 }}
    placeholder="Şarkı veya Sanatçı Ara..."
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    onKeyUp={(e) => e.key === 'Enter' && searchSongs()}
  />
</div>
```

- [ ] **Adım 4: Arama sonucu öğeleri güncelle**

Mevcut arama sonucu div'ini güncelle:
```tsx
<div
  key={getSearchResultKey(song, idx)}
  className="group flex items-center gap-3 p-2.5 rounded-2xl transition-all cursor-pointer"
  style={{
    background: 'rgba(255,255,255,0.025)',
    border: '1px solid var(--border)',
    marginBottom: '6px'
  }}
  onMouseEnter={e => {
    (e.currentTarget as HTMLElement).style.background = 'rgba(227,30,38,0.08)';
    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(227,30,38,0.25)';
  }}
  onMouseLeave={e => {
    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)';
    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
  }}
  onClick={() => addToQueue(song)}
>
  <img src={song.cover_url ?? ''} className="w-10 h-10 rounded-xl object-cover shadow-md group-hover:scale-105 transition-transform" alt="" />
  <div className="flex-1 min-w-0">
    <div className="font-bold text-xs truncate transition-colors group-hover:text-white">{song.title}</div>
    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500 }}>{song.artist}</div>
  </div>
  <div
    className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
    style={{ color: 'var(--text-muted)' }}
  >
    <Plus size={15} />
  </div>
</div>
```

- [ ] **Adım 5: Kullanıcı bilgi kartını güncelle**

Alt kullanıcı bloğunu (satır 402 civarı) güncelle:
```tsx
<div
  className="mt-6 pt-6 space-y-4"
  style={{ borderTop: '1px solid var(--border)' }}
>
  {/* ... admin dashboard buraya ekleniyor ... */}

  <div
    className="flex items-center justify-between p-3 rounded-2xl"
    style={{
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid var(--border)'
    }}
  >
    <div className="flex items-center gap-3">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center font-black relative"
        style={{
          background: 'linear-gradient(135deg, rgba(227,30,38,0.2), rgba(243,106,7,0.15))',
          border: '1px solid rgba(227,30,38,0.25)',
          color: 'var(--primary)',
          fontSize: '16px'
        }}
      >
        {user?.display_name.substring(0, 1).toUpperCase()}
        {!user?.is_guest && (
          <div
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
            style={{ background: 'var(--green)', border: '2px solid var(--background)' }}
          >
            <Trophy size={7} className="text-white" />
          </div>
        )}
      </div>
      <div className="flex flex-col">
        <span style={{ fontSize: '12px', fontWeight: 800 }}>{user?.display_name}</span>
        <div className="flex items-center gap-1.5">
          <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {user?.role === 'admin' ? 'Yönetici' : user?.is_guest ? 'Misafir' : 'Dinleyici'}
          </span>
          {!user?.is_guest && user?.rank_score !== undefined && (
            <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--orange)' }}>
              • {user.rank_score} puan
            </span>
          )}
        </div>
      </div>
    </div>
    <button
      onClick={logout}
      className="p-2 rounded-lg transition-colors"
      style={{ color: 'var(--text-muted)' }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#EF4444'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
      title="Çıkış"
    >
      <LogOut size={15} />
    </button>
  </div>
</div>
```

- [ ] **Adım 6: Tarayıcıda doğrula**

Sidebar üst gradient çizgi, turuncu arama ikonu, logo gradient, puan bilgisi görünmeli.

- [ ] **Adım 7: Commit**
```bash
git add jukebox-web-controller/src/App.tsx
git commit -m "design: admin sidebar — gradient accents, orange search icon, user card"
```

---

### Task 11: Jukebox Görünümü — Now Playing + Queue (Admin)

**Dosyalar:**
- Modify: `jukebox-web-controller/src/App.tsx`

Hedef: Now playing bölümü album kapağı daha dramatik, progress bar kalın gradient, queue öğeleri daha rafine.

- [ ] **Adım 1: Now playing — album art glow güncelle**

```tsx
{/* Glow arkası */}
<div
  className="absolute inset-0 blur-[80px] opacity-30 transition-opacity"
  style={{ background: 'linear-gradient(135deg, #E31E26, #F36A07)' }}
></div>
```

- [ ] **Adım 2: Album art ring güncelle**

```tsx
<img
  src={nowPlaying.cover_url}
  className="w-56 h-56 lg:w-80 lg:h-80 rounded-[40px] shadow-2xl object-cover"
  style={{
    boxShadow: '0 30px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)',
    transition: 'box-shadow 0.5s ease'
  }}
  alt=""
/>
```

- [ ] **Adım 3: Sanatçı adı turuncu**

```tsx
<p style={{ fontSize: '22px', fontWeight: 700, color: 'var(--orange)', letterSpacing: '-0.01em' }}>
  {nowPlaying.artist}
</p>
```

- [ ] **Adım 4: Progress bar — daha kalın, gradient, kenar glow**

```tsx
<div className="h-2 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
  <div
    className="h-full rounded-full relative transition-all duration-1000 ease-linear"
    style={{
      width: `${Math.min(100, (interpolatedProgress / (progress?.duration || nowPlaying.duration_seconds || 1)) * 100)}%`,
      background: 'linear-gradient(90deg, #E31E26, #F36A07)',
      boxShadow: '0 0 12px rgba(243,106,7,0.5)'
    }}
  ></div>
</div>
```

- [ ] **Adım 5: "Şu An Çalıyor" badge güncelle**

```tsx
<div
  className="px-6 py-2 rounded-full flex items-center gap-3 shadow-xl"
  style={{
    background: 'rgba(13,13,18,0.85)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(227,30,38,0.25)'
  }}
>
  <Disc style={{ color: 'var(--orange)' }} size={14} />
  <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Şu An Çalıyor</span>
</div>
```

- [ ] **Adım 6: Queue öğesi (MemoizedQueueItem) güncelle**

Mevcut queue item div'ini güncelle:
```tsx
<div
  className="group relative flex items-center gap-4 p-3 rounded-2xl transition-all"
  style={{
    background: 'rgba(255,255,255,0.025)',
    border: '1px solid var(--border)',
    marginBottom: '8px'
  }}
  onMouseEnter={e => {
    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-bright)';
  }}
  onMouseLeave={e => {
    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)';
    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
  }}
>
```

- [ ] **Adım 7: Priority score badge**

```tsx
<div
  className="flex items-center gap-1.5 px-2 py-1 rounded-full"
  style={{
    background: 'rgba(243,106,7,0.12)',
    border: '1px solid rgba(243,106,7,0.22)'
  }}
>
  <TrendingUp size={9} style={{ color: 'var(--orange)' }} />
  <span style={{ fontSize: '10px', color: 'var(--orange)', fontWeight: 800 }}>{item.priority_score}</span>
</div>
```

- [ ] **Adım 8: Commit**
```bash
git add jukebox-web-controller/src/App.tsx
git commit -m "design: admin now-playing — orange artist, gradient progress, queue polish"
```

---

### Task 12: Admin Dashboard Paneli — Tab Navigasyon (Admin)

**Dosyalar:**
- Modify: `jukebox-web-controller/src/AdminDashboard.tsx`

Hedef: Mevcut 5'li buton grid + accordion yapısını daha net bir yapıya taşı. Üst header daha belirgin, hızlı eylem butonları daha büyük ve renkli. **Tüm mevcut fonksiyonlar ve butonlar korunur.**

- [ ] **Adım 1: AdminDashboard container ve header güncelle**

Mevcut container div'ini (satır 297) güncelle:
```tsx
<div
  className="mb-6 overflow-hidden rounded-2xl"
  style={{
    border: '1px solid rgba(243,106,7,0.25)',
    background: 'rgba(19,19,24,0.9)',
    backdropFilter: 'blur(20px)'
  }}
>
  {/* Üst turuncu çizgi */}
  <div style={{
    height: '2px',
    background: 'linear-gradient(90deg, var(--orange), #E31E26 50%, transparent)',
    opacity: 0.8
  }}></div>

  <div className="p-5">
    {/* Header */}
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: 'var(--orange-dim)', border: '1px solid rgba(243,106,7,0.25)' }}
        >
          <Shield size={13} style={{ color: 'var(--orange)' }} />
        </div>
        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--orange)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
          Admin Paneli
        </span>
      </div>
      {status && (
        <div
          className="px-3 py-1 rounded-full text-[10px] font-bold animate-pulse"
          style={{ background: 'rgba(243,106,7,0.15)', color: 'var(--orange)', border: '1px solid rgba(243,106,7,0.25)' }}
        >
          {status}
        </div>
      )}
    </div>
```

- [ ] **Adım 2: Hızlı eylem butonları — daha büyük, renkli ikonlar**

Mevcut 5'li grid (satır 310-353) güncelle — sınıflar ve stiller korunur, görsel iyileştirme:
```tsx
{/* Quick Actions */}
<div className="grid grid-cols-5 gap-2 mb-5">
  <button
    onClick={skipSong}
    disabled={loading}
    className="flex flex-col items-center justify-center p-3 rounded-xl transition-all active:scale-95 disabled:opacity-50"
    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(227,30,38,0.10)'}
    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'}
  >
    <SkipForward size={18} className="mb-1.5" style={{ color: 'var(--primary)' }} />
    <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Atla</span>
  </button>

  <button
    onClick={processSong}
    disabled={loading}
    className="flex flex-col items-center justify-center p-3 rounded-xl transition-all active:scale-95 disabled:opacity-50"
    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(59,91,255,0.10)'}
    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'}
  >
    <Activity size={18} className="mb-1.5" style={{ color: '#3B5BFF' }} />
    <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Düzelt</span>
  </button>

  <button
    onClick={syncMetadata}
    disabled={loading}
    className="flex flex-col items-center justify-center p-3 rounded-xl transition-all active:scale-95 disabled:opacity-50"
    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(16,185,129,0.10)'}
    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'}
  >
    <RefreshCw size={18} className={`mb-1.5 ${loading ? 'animate-spin' : ''}`} style={{ color: '#10B981' }} />
    <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Sync</span>
  </button>

  <button
    onClick={() => setShowDevices(!showDevices)}
    className="flex flex-col items-center justify-center p-3 rounded-xl transition-all active:scale-95"
    style={{
      background: showDevices ? 'rgba(227,30,38,0.12)' : 'rgba(255,255,255,0.04)',
      border: showDevices ? '1px solid rgba(227,30,38,0.30)' : '1px solid var(--border)'
    }}
  >
    <Monitor size={18} className="mb-1.5" style={{ color: showDevices ? 'var(--primary)' : '#A78BFA' }} />
    <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Cihazlar</span>
  </button>

  <button
    onClick={() => setShowSongs(!showSongs)}
    className="flex flex-col items-center justify-center p-3 rounded-xl transition-all active:scale-95"
    style={{
      background: showSongs ? 'rgba(243,106,7,0.12)' : 'rgba(255,255,255,0.04)',
      border: showSongs ? '1px solid rgba(243,106,7,0.30)' : '1px solid var(--border)'
    }}
  >
    <Music size={18} className="mb-1.5" style={{ color: showSongs ? 'var(--orange)' : 'var(--orange)' }} />
    <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Şarkılar</span>
  </button>
</div>
```

- [ ] **Adım 3: Cihazlar bölümü header güncelle**

```tsx
{showDevices && (
  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
    <div className="flex items-center justify-between mb-3">
      <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.10em', color: '#A78BFA' }}>
        Kayıtlı Cihazlar ({devices.length})
      </span>
      <button
        onClick={() => setShowNewDevice(!showNewDevice)}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-colors"
        style={{ background: 'rgba(167,139,250,0.12)', color: '#A78BFA', border: '1px solid rgba(167,139,250,0.20)' }}
      >
        <Plus size={11} /> Yeni
      </button>
    </div>
```

- [ ] **Adım 4: Cihaz öğeleri güncelle**

Mevcut cihaz kartı div'ini güncelle:
```tsx
<div
  key={d.id}
  onClick={() => onSelectDevice?.(d)}
  className="rounded-xl p-3 cursor-pointer transition-all mb-2"
  style={{
    background: d.id === device?.id ? 'rgba(227,30,38,0.08)' : 'rgba(255,255,255,0.025)',
    border: d.id === device?.id ? '1px solid rgba(227,30,38,0.30)' : '1px solid var(--border)'
  }}
  onMouseEnter={e => {
    if (d.id !== device?.id) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
  }}
  onMouseLeave={e => {
    if (d.id !== device?.id) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)';
  }}
>
```

- [ ] **Adım 5: Şarkılar bölümü header güncelle**

```tsx
{showSongs && (
  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
    <div className="flex items-center justify-between mb-3">
      <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'var(--orange)' }}>
        Şarkı Kütüphanesi ({songs.length})
      </span>
```

- [ ] **Adım 6: Şarkı öğeleri güncelle**

```tsx
<div
  key={s.id}
  className="rounded-xl p-3 flex items-center justify-between mb-2"
  style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border)' }}
>
```

- [ ] **Adım 7: Tarayıcıda doğrula**

Admin panelinde turuncu üst çizgi, renkli eylem butonları, seçili cihaz vurgusu görünmeli.

- [ ] **Adım 8: Commit**
```bash
git add jukebox-web-controller/src/AdminDashboard.tsx
git commit -m "design: admin dashboard panel — orange header, colored action buttons"
```

---

### Task 13: Leaderboard Modal Yenileme (Admin)

**Dosyalar:**
- Modify: `jukebox-web-controller/src/App.tsx` — `LeaderboardView` component

- [ ] **Adım 1: LeaderboardView container güncelle**

```tsx
<div
  className="fixed inset-0 z-[250] flex items-center justify-center p-6 backdrop-blur-2xl"
  style={{ background: 'rgba(0,0,0,0.85)' }}
>
  <div
    className="w-full max-w-lg p-8 relative overflow-hidden flex flex-col"
    style={{
      maxHeight: '80vh',
      background: 'rgba(13,13,18,0.95)',
      border: '1px solid var(--border-bright)',
      borderRadius: '28px',
      backdropFilter: 'blur(24px)'
    }}
  >
    {/* Üst kırmızı→turuncu çizgi */}
    <div
      className="absolute inset-x-0 top-0"
      style={{ height: '2px', background: 'linear-gradient(90deg, transparent, #E31E26 30%, #F36A07 70%, transparent)', opacity: 0.7 }}
    ></div>
```

- [ ] **Adım 2: Başlık ikonu gradient**

```tsx
<div
  className="w-12 h-12 rounded-2xl flex items-center justify-center"
  style={{
    background: 'linear-gradient(135deg, rgba(227,30,38,0.15), rgba(243,106,7,0.15))',
    border: '1px solid rgba(243,106,7,0.25)'
  }}
>
  <Trophy size={26} style={{ color: 'var(--orange)' }} />
</div>
```

- [ ] **Adım 3: 1. sıra öğesi gradient**

```tsx
<div
  key={u.id}
  className="flex items-center gap-4 p-4 rounded-2xl border transition-all"
  style={{
    background: idx === 0 ? 'rgba(243,106,7,0.10)' : 'rgba(255,255,255,0.025)',
    border: idx === 0 ? '1px solid rgba(243,106,7,0.25)' : '1px solid var(--border)'
  }}
>
  <div
    className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm"
    style={{
      background: idx === 0
        ? 'linear-gradient(135deg, #E31E26, #F36A07)'
        : idx === 1 ? 'rgba(148,163,184,0.3)'
        : idx === 2 ? 'rgba(180,120,60,0.3)'
        : 'rgba(255,255,255,0.08)',
      color: 'white'
    }}
  >
    {idx + 1}
  </div>
```

- [ ] **Adım 4: Skor turuncu**

```tsx
<div style={{ fontSize: '14px', fontWeight: 800, color: idx === 0 ? 'var(--orange)' : 'var(--primary)' }}>
  {u.rank_score}
</div>
```

- [ ] **Adım 5: Commit**
```bash
git add jukebox-web-controller/src/App.tsx
git commit -m "design: admin leaderboard — orange #1 rank, gradient accents"
```

---

### Task 14: Mobil Responsive Son Dokunuşlar (Admin)

**Dosyalar:**
- Modify: `jukebox-web-controller/src/index.css`

Hedef: Mobil görünümde (telefon) card padding ve font boyutları optimize edilir.

- [ ] **Adım 1: Mobil utility eklemeleri**

index.css sonuna ekle:
```css
/* Mobile optimizations */
@media (max-width: 640px) {
  .card {
    padding: 16px;
    border-radius: 16px;
  }

  .btn-primary {
    padding: 14px 20px;
    font-size: 12px;
  }

  .input-field {
    padding: 14px 14px;
    font-size: 15px; /* iOS zoom önleme */
  }
}

/* Fade animasyonu */
@keyframes fade {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}

.animate-fade {
  animation: fade 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* Custom scrollbar — tutarlı */
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.08);
  border-radius: 2px;
}
```

- [ ] **Adım 2: Commit**
```bash
git add jukebox-web-controller/src/index.css
git commit -m "design: admin mobile optimizations, fade animation, scrollbar"
```

---

## Uygulama Sonrası Kontrol Listesi

### Kiosk Kontrol
- [ ] Albert Sans yükleniyor, Outfit kullanılmıyor
- [ ] Header'da kırmızı→turuncu gradient çizgi var
- [ ] Live indicator'da turuncu nokta parlıyor
- [ ] Idle state'te spektrum barları animasyonlu
- [ ] Idle başlıkta "Bekliyor" kelimesi gradient renkli
- [ ] Album kapağı 360px ve kırmızı+turuncu glow var
- [ ] Sanatçı adı turuncu (#F36A07)
- [ ] Progress bar'da sağ kenarda turuncu ışık var
- [ ] QR kartında köşe aksan çizgileri var
- [ ] Kuyruk öğelerinde gradient numaralar var
- [ ] Sayfa yüklenişinde staggered animasyon var
- [ ] Gürültü dokusu görünüyor (çok ince)

### Admin Dashboard Kontrol
- [ ] Albert Sans yükleniyor
- [ ] Turuncu orb arka planda
- [ ] Login ekranında gradient logo
- [ ] "Hızlı Başla" butonu kırmızı→turuncu gradient
- [ ] Sidebar üst gradient çizgi var
- [ ] Arama ikonu turuncu
- [ ] Sanatçı adı turuncu
- [ ] Progress bar gradient ve glow var
- [ ] Admin panel üst turuncu çizgi var
- [ ] Admin eylem butonları renk vurgulu
- [ ] Leaderboard 1. sıra turuncu vurgulu
- [ ] Tüm mevcut buton/özellikler çalışıyor

---

## Notlar

- **Mevcut JS mantığı değişmiyor:** `app.js`, `playback.js`, `branding.js`, `spotify-player.js` dosyalarına dokunulmaz.
- **React bileşen mantığı korunuyor:** State, effect, API çağrıları aynen kalır; sadece JSX görsel katmanı güncellenir.
- **Tailwind config değişmiyor:** Tüm renk değişiklikleri CSS custom properties ve inline styles üzerinden yapılır.
- **Geri alınabilirlik:** Her commit kendi başına çalışan bir adım. Herhangi bir task ayrı revert edilebilir.
