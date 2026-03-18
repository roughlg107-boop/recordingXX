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
import { generateVisitReport, transcribeAudio } from "@/lib/openai";
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

    const objectPath = await uploadTemporaryAudioStream(
      input.reportId,
      input.fileName,
      input.mimeType,
      input.stream
    );
    await attachReportAudio(input.reportId, objectPath);

    return { reportId: input.reportId, objectPath };
  } catch (error) {
    if (reportCreated) {
      await failReport(input.reportId, toErrorMessage(error));
    }
    throw error;
  }
}

export async function processReportJob(input: {
  claim: ReportProcessingClaim;
  openAiApiKey: string;
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
    const transcript = await transcribeAudio({
      apiKey: input.openAiApiKey,
      model: input.transcriptionModel,
      filePath: tempFilePath
    });

    await heartbeatReportProcessing(input.claim.reportId, input.processingLeaseMs);
    await heartbeatActiveJobSlot(input.claim.sessionHash, input.claim.reportId, input.processingLeaseMs);

    const report = await generateVisitReport({
      apiKey: input.openAiApiKey,
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
