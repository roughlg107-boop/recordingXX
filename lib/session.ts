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

function resolveClientSessionFromCookieValue(
  cookieValue: string | undefined,
  secret: string
): ResolvedSession | null {
  const sessionId = cookieValue?.trim()
    ? verifySignedSessionValue(cookieValue.trim(), secret)
    : null;

  if (!sessionId) {
    return null;
  }

  return {
    sessionId,
    sessionHash: createSessionHash(sessionId, secret)
  };
}

export function getOrCreateClientSession(request: NextRequest, secret: string): ResolvedSession {
  const existingSession = resolveClientSessionFromCookieValue(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
    secret
  );

  if (existingSession) {
    return existingSession;
  }

  const sessionId = randomBytes(32).toString("base64url");
  return {
    sessionId,
    sessionHash: createSessionHash(sessionId, secret),
    setCookieValue: issueSignedSessionValue(sessionId, secret)
  };
}

export function requireClientSession(request: NextRequest, secret: string): ResolvedSession {
  const session = resolveClientSessionFromCookieValue(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
    secret
  );

  if (!session) {
    throw new AppError("工作階段已失效，請重新整理頁面後再試。", 400, "invalid_client_session");
  }

  return session;
}

export function requireClientSessionFromCookieValue(
  cookieValue: string | undefined,
  secret: string
) {
  const session = resolveClientSessionFromCookieValue(cookieValue, secret);

  if (!session) {
    throw new AppError("工作階段已失效，請重新整理頁面後再試。", 400, "invalid_client_session");
  }

  return session;
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
