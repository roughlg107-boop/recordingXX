import { Readable } from "stream";

import {
  attachReportAudio,
  completeReport,
  createQueuedReport,
  failReport,
  heartbeatReportProcessing,
  type ReportProcessingClaim
} from "@/lib/firestore-reports";
import {
  deleteLocalTemporaryFile,
  deleteTemporaryAudio,
  downloadTemporaryAudioToTempFile,
  uploadTemporaryAudioStream
} from "@/lib/storage";
import { generateVisitReportWithProvider, transcribeAudioWithProvider } from "@/lib/ai-provider";
import type { AiProvider } from "@/lib/ai-providers";
import { heartbeatActiveJobSlot, releaseActiveJobSlot } from "@/lib/rate-limit";
import { toErrorMessage } from "@/lib/errors";

type QueueInput = {
  reportId: string;
  sessionHash: string;
  shopName: string;
  salesName: string;
  visitDate: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  stream: Readable;
};

export async function queueReportJob(input: QueueInput) {
  let reportCreated = false;
  let objectPath = "";

  try {
    await createQueuedReport({
      id: input.reportId,
      sessionHash: input.sessionHash,
      shopName: input.shopName,
      salesName: input.salesName,
      visitDate: input.visitDate,
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSize: input.fileSize
    });
    reportCreated = true;

    objectPath = await uploadTemporaryAudioStream(
      input.reportId,
      input.fileName,
      input.mimeType,
      input.stream
    );
    await attachReportAudio(input.reportId, objectPath);

    return { reportId: input.reportId, objectPath };
  } catch (error) {
    if (objectPath) {
      await deleteTemporaryAudio(objectPath).catch(() => undefined);
    }
    if (reportCreated) {
      await failReport(input.reportId, toErrorMessage(error));
    }
    throw error;
  }
}

export async function processReportJob(input: {
  claim: ReportProcessingClaim;
  provider: AiProvider;
  apiKey: string;
  transcriptionModel: string;
  reportModel: string;
  processingLeaseMs: number;
  processingHeartbeatMs: number;
}) {
  let tempFilePath = "";
  const heartbeatTimer = setInterval(() => {
    void heartbeatReportProcessing(input.claim.reportId, input.processingLeaseMs);
    void heartbeatActiveJobSlot(input.claim.sessionHash, input.claim.reportId, input.processingLeaseMs);
  }, input.processingHeartbeatMs);

  heartbeatTimer.unref?.();

  try {
    await heartbeatReportProcessing(input.claim.reportId, input.processingLeaseMs);
    await heartbeatActiveJobSlot(input.claim.sessionHash, input.claim.reportId, input.processingLeaseMs);

    tempFilePath = await downloadTemporaryAudioToTempFile(input.claim.objectPath, input.claim.fileName);
    const transcript = await transcribeAudioWithProvider({
      provider: input.provider,
      apiKey: input.apiKey,
      model: input.transcriptionModel,
      filePath: tempFilePath,
      mimeType: input.claim.mimeType,
      fileName: input.claim.fileName
    });

    await heartbeatReportProcessing(input.claim.reportId, input.processingLeaseMs);
    await heartbeatActiveJobSlot(input.claim.sessionHash, input.claim.reportId, input.processingLeaseMs);

    const report = await generateVisitReportWithProvider({
      provider: input.provider,
      apiKey: input.apiKey,
      model: input.reportModel,
      shopName: input.claim.shopName,
      salesName: input.claim.salesName,
      visitDate: input.claim.visitDate,
      transcript
    });

    await completeReport(input.claim.reportId, report);
  } catch (error) {
    await failReport(input.claim.reportId, toErrorMessage(error));
  } finally {
    clearInterval(heartbeatTimer);
    if (tempFilePath) {
      await deleteLocalTemporaryFile(tempFilePath).catch(() => undefined);
    }
    await deleteTemporaryAudio(input.claim.objectPath);
    await releaseActiveJobSlot(input.claim.sessionHash, input.claim.reportId);
  }
}
