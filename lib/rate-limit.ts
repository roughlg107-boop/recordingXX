import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { ACTIVE_JOBS_COLLECTION, RATE_LIMIT_COLLECTION } from "@/lib/constants";
import { getDb } from "@/lib/firebase-admin";
import { AppError } from "@/lib/errors";

export async function consumeRateLimit(
  ipHash: string,
  limit: number,
  windowMs: number
) {
  const db = getDb();
  const now = Date.now();
  const bucketStart = Math.floor(now / windowMs) * windowMs;
  const bucketId = `${ipHash}:${bucketStart}`;
  const ref = db.collection(RATE_LIMIT_COLLECTION).doc(bucketId);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const count = snapshot.exists ? Number(snapshot.data()?.count || 0) : 0;

    if (count >= limit) {
      throw new AppError("目前請求過於頻繁，請稍後再試。", 429, "rate_limited");
    }

    transaction.set(
      ref,
      {
        count: count + 1,
        ipHash,
        bucketStart: Timestamp.fromMillis(bucketStart),
        expiresAt: Timestamp.fromMillis(bucketStart + windowMs * 2),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  });
}

export async function acquireActiveJobSlot(ipHash: string, maxJobs: number) {
  const db = getDb();
  const ref = db.collection(ACTIVE_JOBS_COLLECTION).doc(ipHash);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const activeJobs = snapshot.exists ? Number(snapshot.data()?.activeJobs || 0) : 0;

    if (activeJobs >= maxJobs) {
      throw new AppError("目前同一裝置已有處理中的錄音，請等待完成後再提交。", 429, "too_many_jobs");
    }

    transaction.set(
      ref,
      {
        activeJobs: activeJobs + 1,
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + 48 * 60 * 60 * 1000)
      },
      { merge: true }
    );
  });
}

export async function releaseActiveJobSlot(ipHash: string) {
  const db = getDb();
  const ref = db.collection(ACTIVE_JOBS_COLLECTION).doc(ipHash);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) {
      return;
    }

    const activeJobs = Math.max(0, Number(snapshot.data()?.activeJobs || 0) - 1);
    transaction.set(
      ref,
      {
        activeJobs,
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + 48 * 60 * 60 * 1000)
      },
      { merge: true }
    );
  });
}
