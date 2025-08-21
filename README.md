YT Countdown Stream
- Put your RTMP (YT) and Drive file IDs in environment variables or .env (example: .env.example)
- Build: npm install
- Run: node server.js
- For Render: use Background Worker, add env vars, ensure ffmpeg/chromium available (use Dockerfile or apt-get in start command).
