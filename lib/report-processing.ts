import { randomUUID } from "crypto";

import { completeReport, createQueuedReport, failReport, markReportProcessing } from "@/lib/firestore-reports";
import { deleteTemporaryAudio, downloadTemporaryAudio, uploadTemporaryAudio } from "@/lib/storage";
import { generateVisitReport, transcribeAudio } from "@/lib/openai";
import { releaseActiveJobSlot } from "@/lib/rate-limit";
import { toErrorMessage } from "@/lib/errors";

type QueueInput = {
  ipHash: string;
  shopName: string;
  salesName: string;
  visitDate: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  openAiApiKey: string;
  transcriptionModel: string;
  reportModel: string;
};

export async function queueReportJob(input: QueueInput) {
  const reportId = randomUUID();
  let reportCreated = false;

  try {
    await createQueuedReport({
      id: reportId,
      ipHash: input.ipHash,
      shopName: input.shopName,
      salesName: input.salesName,
      visitDate: input.visitDate
    });
    reportCreated = true;

    const objectPath = await uploadTemporaryAudio(reportId, input.fileName, input.mimeType, input.buffer);

    return { reportId, objectPath };
  } catch (error) {
    if (reportCreated) {
      await failReport(reportId, toErrorMessage(error));
    }
    throw error;
  }
}

export async function processReportJob(input: {
  reportId: string;
  objectPath: string;
  ipHash: string;
  shopName: string;
  salesName: string;
  visitDate: string;
  fileName: string;
  mimeType: string;
  openAiApiKey: string;
  transcriptionModel: string;
  reportModel: string;
}) {
  try {
    await markReportProcessing(input.reportId);
    const buffer = await downloadTemporaryAudio(input.objectPath);
    const transcript = await transcribeAudio({
      apiKey: input.openAiApiKey,
      model: input.transcriptionModel,
      fileName: input.fileName,
      mimeType: input.mimeType,
      buffer
    });

    const report = await generateVisitReport({
      apiKey: input.openAiApiKey,
      model: input.reportModel,
      shopName: input.shopName,
      salesName: input.salesName,
      visitDate: input.visitDate,
      transcript
    });

    await completeReport(input.reportId, report);
  } catch (error) {
    await failReport(input.reportId, toErrorMessage(error));
  } finally {
    await deleteTemporaryAudio(input.objectPath);
    await releaseActiveJobSlot(input.ipHash);
  }
}
