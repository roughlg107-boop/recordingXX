import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

import type { VisitReportRecord } from "@/lib/types";
import { formatDisplayDate, formatReportActivityAction, formatVisitDate } from "@/lib/formatters";

function sectionTitle(title: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: {
      before: 320,
      after: 140
    },
    children: [new TextRun({ text: title, bold: true })]
  });
}

function bulletList(items: string[]) {
  return items.map(
    (item) =>
      new Paragraph({
        text: item,
        bullet: {
          level: 0
        },
        spacing: {
          after: 120
        }
      })
  );
}

export async function buildReportDocx(report: VisitReportRecord) {
  const activityLines = report.activityLog.map(
    (item) =>
      `${formatDisplayDate(item.createdAt)}｜${item.actorLabel}｜${formatReportActivityAction(item.action)}${
        item.detail ? `｜${item.detail}` : ""
      }`
  );

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [new TextRun({ text: `${report.shopName} 拜訪報告`, bold: true })],
            spacing: { after: 260 }
          }),
          new Paragraph({
            children: [new TextRun(`業務：${report.salesName}`)]
          }),
          new Paragraph({
            children: [new TextRun(`拜訪日期：${formatVisitDate(report.visitDate)}`)]
          }),
          new Paragraph({
            children: [new TextRun(`報告建立：${formatDisplayDate(report.createdAt)}`)],
            spacing: { after: 260 }
          }),
          sectionTitle("重點摘要"),
          ...bulletList(report.summary),
          sectionTitle("拜訪脈絡"),
          new Paragraph({
            children: [new TextRun(report.visitNarrative)]
          }),
          sectionTitle("目前行銷現況"),
          new Paragraph({
            children: [new TextRun(report.currentMarketingStatus)]
          }),
          sectionTitle("需求與痛點"),
          ...bulletList(report.needsAndPainPoints),
          sectionTitle("店家目標"),
          ...bulletList(report.goals),
          sectionTitle("未確認資訊"),
          ...(report.uncertaintyNotes.length
            ? bulletList(report.uncertaintyNotes)
            : [new Paragraph({ children: [new TextRun("無。")] })]),
          sectionTitle("操作紀錄"),
          ...(activityLines.length
            ? bulletList(activityLines)
            : [new Paragraph({ children: [new TextRun("無。")] })])
        ]
      }
    ]
  });

  return Packer.toBuffer(doc);
}
