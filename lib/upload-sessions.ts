import { randomUUID } from "crypto";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { getDb } from "@/lib/firebase-admin";
import { UPLOAD_SESSION_COLLECTION } from "@/lib/constants";
import { AppError } from "@/lib/errors";

type StoredUploadSession = {
  sessionHash: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  consumedAt?: Timestamp;
};

export async function createUploadSession(input: {
  sessionHash: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  expiresAt: number;
}) {
  const id = randomUUID();

  await getDb()
    .collection(UPLOAD_SESSION_COLLECTION)
    .doc(id)
    .set({
      sessionHash: input.sessionHash,
      fileName: input.fileName,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(input.expiresAt)
    });

  return id;
}

export async function consumeUploadSession(input: {
  uploadSessionId: string;
  sessionHash: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}) {
  const db = getDb();
  const ref = db.collection(UPLOAD_SESSION_COLLECTION).doc(input.uploadSessionId);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);

    if (!snapshot.exists) {
      throw new AppError("上傳工作已失效，請重新選擇錄音檔。", 400, "upload_session_missing");
    }

    const data = snapshot.data() as StoredUploadSession;

    if (data.expiresAt.toDate().getTime() <= Date.now()) {
      throw new AppError("上傳工作已過期，請重新初始化。", 400, "upload_session_expired");
    }

    if (data.sessionHash !== input.sessionHash) {
      throw new AppError("上傳工作不屬於目前的瀏覽器工作階段。", 403, "upload_session_mismatch");
    }

    if (data.consumedAt) {
      throw new AppError("這個上傳工作已經使用過，請重新選擇錄音檔。", 409, "upload_session_consumed");
    }

    if (
      data.fileName !== input.fileName ||
      data.fileSize !== input.fileSize ||
      (data.mimeType || "") !== (input.mimeType || "")
    ) {
      throw new AppError("錄音檔與初始化資訊不一致，請重新上傳。", 400, "upload_session_payload_mismatch");
    }

    transaction.set(
      ref,
      {
        consumedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  });
}
