import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { ACTIVE_JOBS_COLLECTION, RATE_LIMIT_COLLECTION } from "@/lib/constants";
import { getDb } from "@/lib/firebase-admin";
import { AppError } from "@/lib/errors";

export async function consumeRateLimit(
  sessionHash: string,
  limit: number,
  windowMs: number
) {
  const db = getDb();
  const now = Date.now();
  const bucketStart = Math.floor(now / windowMs) * windowMs;
  const bucketId = `${sessionHash}:${bucketStart}`;
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
        sessionHash,
        bucketStart: Timestamp.fromMillis(bucketStart),
        expiresAt: Timestamp.fromMillis(bucketStart + windowMs * 2),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  });
}

export async function acquireActiveJobSlot(
  sessionHash: string,
  reportId: string,
  maxJobs: number,
  leaseMs: number
) {
  const db = getDb();
  const ref = db.collection(ACTIVE_JOBS_COLLECTION).doc(sessionHash);
  const now = Date.now();

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const rawJobs = snapshot.exists ? (snapshot.data()?.jobs as Record<string, Timestamp> | undefined) : undefined;
    const prunedJobs = Object.fromEntries(
      Object.entries(rawJobs || {}).filter(([, value]) => value.toDate().getTime() > now)
    );

    if (Object.keys(prunedJobs).length >= maxJobs) {
      throw new AppError("目前同一裝置已有處理中的錄音，請等待完成後再提交。", 429, "too_many_jobs");
    }

    prunedJobs[reportId] = Timestamp.fromMillis(now + leaseMs);

    transaction.set(
      ref,
      {
        jobs: prunedJobs,
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(now + leaseMs)
      },
      { merge: true }
    );
  });
}

export async function heartbeatActiveJobSlot(sessionHash: string, reportId: string, leaseMs: number) {
  const db = getDb();
  const ref = db.collection(ACTIVE_JOBS_COLLECTION).doc(sessionHash);
  const now = Date.now();

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const rawJobs = snapshot.exists ? ((snapshot.data()?.jobs as Record<string, Timestamp> | undefined) || {}) : {};
    const nextJobs = Object.fromEntries(
      Object.entries(rawJobs).filter(([, value]) => value.toDate().getTime() > now)
    );

    nextJobs[reportId] = Timestamp.fromMillis(now + leaseMs);
    transaction.set(
      ref,
      {
        jobs: nextJobs,
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(now + leaseMs)
      },
      { merge: true }
    );
  });
}

export async function releaseActiveJobSlot(sessionHash: string, reportId: string) {
  const db = getDb();
  const ref = db.collection(ACTIVE_JOBS_COLLECTION).doc(sessionHash);
  const now = Date.now();

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) {
      return;
    }

    const rawJobs = (snapshot.data()?.jobs as Record<string, Timestamp> | undefined) || {};
    const nextJobs = Object.fromEntries(
      Object.entries(rawJobs).filter(
        ([key, value]) => key !== reportId && value.toDate().getTime() > now
      )
    );

    transaction.set(
      ref,
      {
        jobs: nextJobs,
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(
          Object.values(nextJobs).length
            ? Math.max(...Object.values(nextJobs).map((value) => value.toDate().getTime()))
            : now + 5 * 60 * 1000
        )
      },
      { merge: true }
    );
  });
}
