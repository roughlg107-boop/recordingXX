import { NextRequest } from "next/server";

import {
  clearFirebaseSessionCookie,
  createFirebaseSessionCookie,
  setFirebaseSessionCookie
} from "@/lib/firebase-auth";
import { AppError, toErrorMessage } from "@/lib/errors";
import { jsonResponse } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as { idToken?: string };
    const idToken = payload.idToken?.trim();

    if (!idToken) {
      throw new AppError("缺少登入憑證，請重新登入。", 400, "missing_id_token");
    }

    const sessionCookie = await createFirebaseSessionCookie(idToken);
    const response = jsonResponse({ ok: true });
    setFirebaseSessionCookie(response, sessionCookie);
    return response;
  } catch (error) {
    const appError =
      error instanceof AppError ? error : new AppError(toErrorMessage(error), 400, "auth_session_failed");

    return jsonResponse(
      {
        ok: false,
        code: appError.code,
        message: appError.message
      },
      appError.statusCode
    );
  }
}

export async function DELETE() {
  const response = jsonResponse({ ok: true });
  clearFirebaseSessionCookie(response);
  return response;
}

