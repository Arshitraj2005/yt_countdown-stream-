
FROM debian:bookworm-slim

# Install ffmpeg, chromium, node
RUN apt-get update && apt-get install -y \
    ffmpeg chromium wget ca-certificates curl gnupg \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y nodejs \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . /app

RUN npm install --production

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node","server.js"]
