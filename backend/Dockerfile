FROM node:20-alpine AS backend-builder

WORKDIR /build/backend

COPY backend/package*.json ./
RUN npm install

COPY backend/ ./
RUN npm run build

FROM node:20-alpine AS controller-builder

WORKDIR /build/jukebox-web-controller

COPY jukebox-web-controller/package*.json ./
RUN npm install

COPY jukebox-web-controller/ ./
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY --from=backend-builder /build/backend/package*.json ./
COPY --from=backend-builder /build/backend/dist ./dist
COPY --from=backend-builder /build/backend/src/db ./src/db
COPY --from=controller-builder /build/jukebox-web-controller/dist /jukebox-web-controller/dist
COPY kiosk-web /kiosk-web
RUN npm install --production

# Install FFmpeg for audio processing
RUN apk add --no-cache ffmpeg

EXPOSE 3000

CMD ["npm", "start"]
