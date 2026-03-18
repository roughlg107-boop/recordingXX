import { getBucket } from "@/lib/firebase-admin";
import { UPLOAD_FOLDER } from "@/lib/constants";
import { safeFileName } from "@/lib/utils";

export async function uploadTemporaryAudio(
  reportId: string,
  fileName: string,
  mimeType: string,
  buffer: Buffer
) {
  const bucket = getBucket();
  const objectPath = `${UPLOAD_FOLDER}/${reportId}/${safeFileName(fileName)}`;
  const file = bucket.file(objectPath);

  await file.save(buffer, {
    contentType: mimeType || "application/octet-stream",
    resumable: false,
    metadata: {
      cacheControl: "private, max-age=0, no-store"
    }
  });

  return objectPath;
}

export async function downloadTemporaryAudio(objectPath: string) {
  const [buffer] = await getBucket().file(objectPath).download();
  return buffer;
}

export async function deleteTemporaryAudio(objectPath: string) {
  await getBucket().file(objectPath).delete({ ignoreNotFound: true });
}
