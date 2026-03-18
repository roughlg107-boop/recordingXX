import { createWriteStream } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

import { getBucket } from "@/lib/firebase-admin";
import { UPLOAD_FOLDER } from "@/lib/constants";
import { safeFileName } from "@/lib/utils";

export async function uploadTemporaryAudioStream(
  reportId: string,
  fileName: string,
  mimeType: string,
  stream: Readable
) {
  const bucket = getBucket();
  const objectPath = `${UPLOAD_FOLDER}/${reportId}/${safeFileName(fileName)}`;
  const file = bucket.file(objectPath);

  await pipeline(
    stream,
    file.createWriteStream({
      contentType: mimeType || "application/octet-stream",
      resumable: false,
      metadata: {
        cacheControl: "private, max-age=0, no-store"
      }
    })
  );

  return objectPath;
}

export async function downloadTemporaryAudioToTempFile(objectPath: string, fileName: string) {
  const tempDir = await mkdtemp(join(tmpdir(), "recordingxx-"));
  const tempPath = join(tempDir, safeFileName(fileName) || "audio.tmp");

  await pipeline(getBucket().file(objectPath).createReadStream(), createWriteStream(tempPath));
  return tempPath;
}

export async function deleteTemporaryAudio(objectPath: string) {
  await getBucket().file(objectPath).delete({ ignoreNotFound: true });
}

export async function deleteLocalTemporaryFile(filePath: string) {
  await rm(filePath, { force: true });
  await rm(dirname(filePath), { recursive: true, force: true }).catch(() => undefined);
}
