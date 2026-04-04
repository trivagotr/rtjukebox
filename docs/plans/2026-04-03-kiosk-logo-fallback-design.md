# Kiosk Logo Fallback Design

**Date:** 2026-04-03

## Goal

Kiosk ekranının sol üst köşesindeki `RadioTEDU` metnini, varsayılan olarak BYZ logoyu gösterecek şekilde güncellemek; logo yüklenemezse aynı alanda metin fallback'ı bırakmak.

## Approach

- Mevcut header yapısı korunacak; sadece logo bloğu zenginleştirilecek.
- BYZ logo asset'i `kiosk-web` statik alanına alınacak ki kiosk route'u altında doğrudan servis edilebilsin.
- Header içinde gerçek bir `<img>` kullanılacak.
- `RadioTEDU` metni DOM'da kalacak, fakat sadece fallback olarak görünür olacak.
- Küçük bir branding helper'ı logo `load` ve `error` olaylarına göre görünürlüğü yönetecek.

## Files

- Modify: `kiosk-web/index.html`
- Modify: `kiosk-web/style.css`
- Modify: `kiosk-web/app.js`
- Create: `kiosk-web/branding.js`
- Create: `kiosk-web/branding.test.js`
- Create: `kiosk-web/assets/logo-03byz-scaled.png`

## Success Criteria

- Normal durumda sol üstte sadece BYZ logo görünür.
- Görsel yüklenmezse aynı bölgede `RadioTEDU` fallback metni görünür.
- Header hizası ve mevcut kiosk görünümü bozulmaz.
- Davranış birim test ile doğrulanır.
