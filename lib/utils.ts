import { createHash } from "crypto";
import { NextResponse } from "next/server";

import { ALLOWED_AUDIO_EXTENSIONS, ALLOWED_AUDIO_MIME_TYPES } from "@/lib/constants";
import { AppError } from "@/lib/errors";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function getFileExtension(fileName: string) {
  const segments = fileName.toLowerCase().split(".");
  if (segments.length <= 1) {
    return "";
  }

  return `.${segments.pop()}`;
}

export function assertSupportedAudio(fileName: string, mimeType?: string) {
  const extension = getFileExtension(fileName);
  const mime = mimeType?.toLowerCase().trim();
  const extensionAllowed = ALLOWED_AUDIO_EXTENSIONS.includes(extension as (typeof ALLOWED_AUDIO_EXTENSIONS)[number]);
  const mimeAllowed = !mime || ALLOWED_AUDIO_MIME_TYPES.includes(mime as (typeof ALLOWED_AUDIO_MIME_TYPES)[number]);

  if (!extensionAllowed || !mimeAllowed) {
    throw new AppError("目前只支援 m4a、mp3、wav 錄音檔。", 400, "unsupported_audio");
  }
}

export function createIpHash(ip: string, salt: string) {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export function getClientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }

  return headers.get("x-real-ip") || "unknown";
}

export function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}

export function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}
