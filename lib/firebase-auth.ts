import type { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuth } from "firebase-admin/auth";

import { AppError } from "@/lib/errors";
import { getFirebaseAdminApp } from "@/lib/firebase-admin";

export const AUTH_SESSION_COOKIE_NAME = "recordingxx_auth";
const AUTH_SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;

function getFirebaseAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}

export async function createFirebaseSessionCookie(idToken: string) {
  return getFirebaseAdminAuth().createSessionCookie(idToken, {
    expiresIn: AUTH_SESSION_MAX_AGE_MS
  });
}

export async function verifyFirebaseSessionCookie(sessionCookie: string) {
  return getFirebaseAdminAuth().verifySessionCookie(sessionCookie, true);
}

export function setFirebaseSessionCookie(response: NextResponse, sessionCookie: string) {
  response.cookies.set({
    name: AUTH_SESSION_COOKIE_NAME,
    value: sessionCookie,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(AUTH_SESSION_MAX_AGE_MS / 1000)
  });
}

export function clearFirebaseSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: AUTH_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

export async function requireAuthenticatedRequest(request: NextRequest) {
  const sessionCookie = request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value?.trim();

  if (!sessionCookie) {
    throw new AppError("請先登入後再使用。", 401, "auth_required");
  }

  try {
    return await verifyFirebaseSessionCookie(sessionCookie);
  } catch {
    throw new AppError("登入已失效，請重新登入。", 401, "invalid_auth_session");
  }
}

export async function getAuthenticatedPageUser() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value?.trim();

  if (!sessionCookie) {
    return null;
  }

  try {
    return await verifyFirebaseSessionCookie(sessionCookie);
  } catch {
    return null;
  }
}
