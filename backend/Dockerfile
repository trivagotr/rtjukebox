FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
RUN npm install --production

# Install FFmpeg for audio processing
RUN apk add --no-cache ffmpeg

EXPOSE 3000

CMD ["npm", "start"]
