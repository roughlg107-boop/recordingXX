import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import ffmpegPath from "ffmpeg-static";
import ffprobePath from "ffprobe-static";

function runProcess(binary: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Process exited with code ${code}`));
    });
  });
}

export async function createTempWorkspace(reportId: string): Promise<string> {
  return fs.mkdtemp(path.join(tmpdir(), `visit-report-${reportId}-`));
}

export async function normalizeAudioForTranscription(
  sourcePath: string,
  workingDir: string,
): Promise<string> {
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static is not available.");
  }

  const targetPath = path.join(workingDir, "normalized.mp3");
  await runProcess(ffmpegPath, [
    "-y",
    "-i",
    sourcePath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-b:a",
    "16k",
    targetPath,
  ]);

  const stats = await fs.stat(targetPath);
  const maxSize = 25 * 1024 * 1024;
  if (stats.size > maxSize) {
    throw new Error("音檔轉換後仍超過 25MB，請縮短錄音或改用更小檔案。");
  }
  return targetPath;
}

export async function getAudioDurationSeconds(sourcePath: string): Promise<number> {
  const ffprobeBinary = ffprobePath.path;
  const args = [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    sourcePath,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(ffprobeBinary, args, { stdio: ["ignore", "pipe", "ignore"] });
    let output = "";

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited with code ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(output) as { format?: { duration?: string } };
        resolve(Math.round(Number(parsed.format?.duration ?? 0)));
      } catch (error) {
        reject(error);
      }
    });
  });
}
