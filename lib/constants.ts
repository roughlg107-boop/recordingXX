export const REPORT_COLLECTION = "visitReports";
export const RATE_LIMIT_COLLECTION = "rateLimitBuckets";
export const ACTIVE_JOBS_COLLECTION = "activeJobCounters";
export const UPLOAD_SESSION_COLLECTION = "uploadSessions";
export const UPLOAD_FOLDER = "uploads";
export const SESSION_COOKIE_NAME = "recordingxx_session";
export const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export const ALLOWED_AUDIO_EXTENSIONS = [".m4a", ".mp3", ".wav"] as const;
export const ALLOWED_AUDIO_MIME_TYPES = [
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave"
] as const;

export const DEFAULT_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;
export const DEFAULT_UPLOAD_MAX_MINUTES = 90;
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 10;
export const DEFAULT_RATE_LIMIT_MAX_ACTIVE_JOBS = 2;
export const UPLOAD_TOKEN_TTL_MS = 10 * 60 * 1000;
export const UPLOAD_SESSION_TTL_MS = 15 * 60 * 1000;
export const REPORT_RETENTION_HOURS = 24;
export const DEFAULT_PROCESSING_LEASE_MS = 10 * 60 * 1000;
export const DEFAULT_PROCESSING_HEARTBEAT_MS = 60 * 1000;
