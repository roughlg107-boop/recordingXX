import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { SESSION_COOKIE_MAX_AGE_SECONDS, SESSION_COOKIE_NAME } from "@/lib/constants";
import { AppError } from "@/lib/errors";

type ResolvedSession = {
  sessionId: string;
  sessionHash: string;
  setCookieValue?: string;
};

function signSessionId(sessionId: string, secret: string) {
  return createHmac("sha256", secret).update(`session:${sessionId}`).digest("base64url");
}

function createSessionHash(sessionId: string, secret: string) {
  return createHmac("sha256", secret).update(`session-hash:${sessionId}`).digest("hex");
}

function issueSignedSessionValue(sessionId: string, secret: string) {
  return `${sessionId}.${signSessionId(sessionId, secret)}`;
}

function verifySignedSessionValue(value: string, secret: string) {
  const [sessionId, signature] = value.split(".");

  if (!sessionId || !signature) {
    return null;
  }

  const expected = signSessionId(sessionId, secret);
  const valid =
    expected.length === signature.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(signature));

  if (!valid) {
    return null;
  }

  return sessionId;
}

export function getOrCreateClientSession(request: NextRequest, secret: string): ResolvedSession {
  const existingValue = request.cookies.get(SESSION_COOKIE_NAME)?.value?.trim();
  const existingSessionId = existingValue ? verifySignedSessionValue(existingValue, secret) : null;

  if (existingSessionId) {
    return {
      sessionId: existingSessionId,
      sessionHash: createSessionHash(existingSessionId, secret)
    };
  }

  const sessionId = randomBytes(32).toString("base64url");
  return {
    sessionId,
    sessionHash: createSessionHash(sessionId, secret),
    setCookieValue: issueSignedSessionValue(sessionId, secret)
  };
}

export function requireClientSession(request: NextRequest, secret: string): ResolvedSession {
  const value = request.cookies.get(SESSION_COOKIE_NAME)?.value?.trim() || "";
  const sessionId = verifySignedSessionValue(value, secret);

  if (!sessionId) {
    throw new AppError("工作階段已失效，請重新整理頁面後再試。", 400, "invalid_client_session");
  }

  return {
    sessionId,
    sessionHash: createSessionHash(sessionId, secret)
  };
}

export function setClientSessionCookie(response: NextResponse, cookieValue: string) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: cookieValue,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS
  });
}
