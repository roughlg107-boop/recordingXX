import { App, applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

import { AppError } from "@/lib/errors";
import { getServerEnv } from "@/lib/env";

let cachedApp: App | null = null;

function resolveCredential() {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (clientEmail && privateKey) {
    return cert({
      projectId: getServerEnv().firebaseProjectId || process.env.GOOGLE_CLOUD_PROJECT,
      clientEmail,
      privateKey
    });
  }

  return applicationDefault();
}

export function getFirebaseAdminApp() {
  if (cachedApp) {
    return cachedApp;
  }

  if (getApps().length > 0) {
    cachedApp = getApps()[0]!;
    return cachedApp;
  }

  const env = getServerEnv();

  if (!env.firebaseProjectId) {
    throw new AppError("缺少 FIREBASE_PROJECT_ID，無法連線 Firebase。", 500, "missing_firebase_project");
  }

  cachedApp = initializeApp({
    credential: resolveCredential(),
    projectId: env.firebaseProjectId,
    storageBucket: env.firebaseStorageBucket || undefined
  });

  return cachedApp;
}

export function getDb() {
  const env = getServerEnv();
  const app = getFirebaseAdminApp();

  if (!env.firebaseDatabaseId || env.firebaseDatabaseId === "(default)") {
    return getFirestore(app);
  }

  return getFirestore(app, env.firebaseDatabaseId);
}

export function getBucket() {
  const env = getServerEnv();

  if (!env.firebaseStorageBucket) {
    throw new AppError(
      "缺少 FIREBASE_STORAGE_BUCKET，無法儲存暫存錄音檔。",
      500,
      "missing_storage_bucket"
    );
  }

  return getStorage(getFirebaseAdminApp()).bucket(env.firebaseStorageBucket);
}
