import { createHmac, timingSafeEqual } from "crypto";

import { AppError } from "@/lib/errors";
import type { UploadTokenPayload } from "@/lib/types";

function base64urlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64urlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function issueUploadToken(payload: UploadTokenPayload, secret: string) {
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyUploadToken(token: string, secret: string) {
  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    throw new AppError("上傳工作已失效，請重新選擇錄音檔。", 400, "invalid_upload_token");
  }

  const expectedSignature = signPayload(encodedPayload, secret);
  const valid =
    expectedSignature.length === signature.length &&
    timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));

  if (!valid) {
    throw new AppError("上傳工作已失效，請重新選擇錄音檔。", 400, "invalid_upload_token");
  }

  const payload = JSON.parse(base64urlDecode(encodedPayload)) as UploadTokenPayload;

  if (Date.now() > payload.expiresAt) {
    throw new AppError("上傳工作已過期，請重新初始化。", 400, "expired_upload_token");
  }

  if (!payload.uploadSessionId || !payload.sessionHash) {
    throw new AppError("上傳工作已失效，請重新選擇錄音檔。", 400, "invalid_upload_token");
  }

  return payload;
}
