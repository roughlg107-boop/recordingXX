import {
  DEFAULT_RATE_LIMIT_MAX_ACTIVE_JOBS,
  DEFAULT_RATE_LIMIT_MAX_REQUESTS,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
  DEFAULT_PROCESSING_HEARTBEAT_MS,
  DEFAULT_PROCESSING_LEASE_MS,
  DEFAULT_UPLOAD_MAX_BYTES,
  DEFAULT_UPLOAD_MAX_MINUTES
} from "@/lib/constants";
import { AppError } from "@/lib/errors";

function toNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getServerEnv() {
  const rateLimitSalt = process.env.RATE_LIMIT_SALT?.trim();

  if (!rateLimitSalt) {
    throw new AppError("缺少 RATE_LIMIT_SALT，無法啟用安全的工作階段與上傳保護。", 500, "missing_rate_limit_salt");
  }

  return {
    appBaseUrl: process.env.APP_BASE_URL?.trim() || "http://localhost:3000",
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID?.trim() || "",
    firebaseStorageBucket: process.env.FIREBASE_STORAGE_BUCKET?.trim() || "",
    firebaseDatabaseId: process.env.FIREBASE_DATABASE_ID?.trim() || "(default)",
    uploadMaxBytes: toNumber(process.env.UPLOAD_MAX_BYTES, DEFAULT_UPLOAD_MAX_BYTES),
    uploadMaxMinutes: toNumber(process.env.UPLOAD_MAX_MINUTES, DEFAULT_UPLOAD_MAX_MINUTES),
    rateLimitWindowMs: toNumber(process.env.RATE_LIMIT_WINDOW_MS, DEFAULT_RATE_LIMIT_WINDOW_MS),
    rateLimitMaxRequests: toNumber(process.env.RATE_LIMIT_MAX_REQUESTS, DEFAULT_RATE_LIMIT_MAX_REQUESTS),
    rateLimitMaxActiveJobs: toNumber(
      process.env.RATE_LIMIT_MAX_ACTIVE_JOBS,
      DEFAULT_RATE_LIMIT_MAX_ACTIVE_JOBS
    ),
    processingLeaseMs: toNumber(process.env.PROCESSING_LEASE_MS, DEFAULT_PROCESSING_LEASE_MS),
    processingHeartbeatMs: toNumber(
      process.env.PROCESSING_HEARTBEAT_MS,
      DEFAULT_PROCESSING_HEARTBEAT_MS
    ),
    rateLimitSalt
  };
}
