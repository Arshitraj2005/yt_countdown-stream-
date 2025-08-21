// server.js
import express from "express";
import dotenv from "dotenv";
import { spawn } from "child_process";
import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";
import { getStream } from "puppeteer-stream";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const WIDTH = parseInt(process.env.WIDTH || "1920", 10);
const HEIGHT = parseInt(process.env.HEIGHT || "1080", 10);
const FPS = parseInt(process.env.FPS || "30", 10);

const YT_RTMP = process.env.YT_RTMP || "";      // must be set
const DRIVE_AUDIO = process.env.DRIVE_AUDIO || "";
const DRIVE_BG = process.env.DRIVE_BG || "";

if (!YT_RTMP) {
  console.error("[ERROR] YT_RTMP not set in environment. Exiting.");
  process.exit(1);
}

const app = express();
app.use(express.static(path.join(__dirname, "frontend")));
app.get("/health", (req, res) => res.json({ ok: true }));

const server = app.listen(PORT, () => {
  console.log(`[HTTP] Frontend serving on http://localhost:${PORT}`);
  startStreaming();
});

async function startStreaming() {
  console.log("[STREAM] Launching headless browser...");
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      `--window-size=${WIDTH},${HEIGHT}`,
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--autoplay-policy=no-user-gesture-required",
      "--mute-audio"
    ],
    defaultViewport: { width: WIDTH, height: HEIGHT }
  });

  const page = await browser.newPage();

  // Build URL so frontend can pick the Drive audio/bg IDs
  const params = new URLSearchParams({
    drive_audio: DRIVE_AUDIO,
    drive_bg: DRIVE_BG,
    server: "1",
    mute: "1" // mute local audio in Chrome; audio will be pulled directly by ffmpeg from Drive
  }).toString();

  const url = `http://localhost:${PORT}/index.html?${params}`;
  console.log("[PAGE] Loading", url);
  await page.goto(url, { waitUntil: "networkidle2" });
  await page.waitForTimeout(1200);

  console.log("[CAPTURE] Starting Puppeteer capture (video only)...");
  const stream = await getStream(page, { audio: false, video: true, fps: FPS, mimeType: "video/webm;codecs=vp8" });

  // Prepare ffmpeg args
  const ffArgs = [];

  // Input 0: video pipe (puppeteer)
  ffArgs.push("-re", "-f", "webm", "-i", "pipe:0");

  // Input 1: audio from Drive (if provided)
  let audioUrl = null;
  if (DRIVE_AUDIO) {
    audioUrl = `https://drive.google.com/uc?export=download&id=${DRIVE_AUDIO}`;
    ffArgs.push("-re", "-i", audioUrl);
  }

  // Video encoding mapping
  ffArgs.push(
    "-map", "0:v:0",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", process.env.X264_PRESET || "veryfast",
    "-r", String(FPS),
    "-b:v", process.env.VBITRATE || "4500k"
  );

  if (audioUrl) {
    ffArgs.push(
      "-map", "1:a:0",
      "-c:a", "aac",
      "-b:a", process.env.ABITRATE || "160k",
      "-ar", "44100",
      "-ac", "2"
    );
  } else {
    ffArgs.push("-an");
  }

  // Output to RTMP
  ffArgs.push("-f", "flv", YT_RTMP);

  console.log("[FFMPEG] ffmpeg " + ffArgs.join(" "));
  const ff = spawn("ffmpeg", ffArgs, { stdio: ["pipe", "
inherit", "inherit"] });

  ff.on("close", async (code) => {
    console.log("[FFMPEG] exited with code", code);
    try { await browser.close(); } catch (_) {}
    process.exit(code || 0);
  });

  // Pipe video stream to ffmpeg stdin
  stream.pipe(ff.stdin);

  // graceful shutdown
  process.on("SIGINT", async () => {
    console.log("[SYS] Shutting down...");
    try { stream.destroy(); } catch (_) {}
    try { ff.kill("SIGINT"); } catch (_) {}
    try { await browser.close(); } catch (_) {}
    server.close();
    process.exit(0);
  });
}

                                               
