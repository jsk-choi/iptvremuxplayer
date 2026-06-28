FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY public ./public
COPY server.js ./

RUN mkdir -p hls-temp

ENV FFMPEG_PATH=ffmpeg
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
