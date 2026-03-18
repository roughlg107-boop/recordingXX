import { readFile } from "node:fs/promises";
import path from "node:path";

import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import JSZip from "jszip";
import xpath from "xpath";

import type { ManualFields } from "./types.js";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const selector = xpath.useNamespaces({ w: WORD_NS });
const serializer = new XMLSerializer();

function selectNodes(node: Node, expression: string): Node[] {
  const result = selector(expression, node);
  return Array.isArray(result) ? result : [];
}

function getNodeText(node: Node): string {
  const texts = selectNodes(node, ".//w:t/text()");
  return texts.map((textNode) => textNode.nodeValue ?? "").join("");
}

function createTextRun(document: Document, text: string, lineBreak = false): Element {
  const run = document.createElementNS(WORD_NS, "w:r");
  if (lineBreak) {
    run.appendChild(document.createElementNS(WORD_NS, "w:br"));
  }
  const runProperties = document.createElementNS(WORD_NS, "w:rPr");
  const fonts = document.createElementNS(WORD_NS, "w:rFonts");
  fonts.setAttribute("w:ascii", "微軟正黑體");
  fonts.setAttribute("w:eastAsia", "微軟正黑體");
  fonts.setAttribute("w:hAnsi", "微軟正黑體");
  runProperties.appendChild(fonts);
  run.appendChild(runProperties);

  const textElement = document.createElementNS(WORD_NS, "w:t");
  if (/^\s|\s$/.test(text)) {
    textElement.setAttribute("xml:space", "preserve");
  }
  textElement.appendChild(document.createTextNode(text));
  run.appendChild(textElement);
  return run;
}

function createParagraph(document: Document, text: string): Element {
  const paragraph = document.createElementNS(WORD_NS, "w:p");
  const paragraphProperties = document.createElementNS(WORD_NS, "w:pPr");
  const runProperties = document.createElementNS(WORD_NS, "w:rPr");
  const language = document.createElementNS(WORD_NS, "w:lang");
  language.setAttribute("w:eastAsia", "zh-TW");
  runProperties.appendChild(language);
  paragraphProperties.appendChild(runProperties);
  paragraph.appendChild(paragraphProperties);

  if (!text) {
    return paragraph;
  }

  const lines = text.split("\n");
  lines.forEach((line, index) => {
    paragraph.appendChild(createTextRun(document, line, index > 0));
  });
  return paragraph;
}

function replaceCellValue(document: Document, row: Node, value: string): void {
  const cells = selectNodes(row, "./w:tc") as Element[];
  const targetCell = cells[1];
  if (!targetCell) {
    return;
  }

  const removableChildren = Array.from(targetCell.childNodes).filter(
    (node) => node.nodeName !== "w:tcPr",
  );
  removableChildren.forEach((node) => targetCell.removeChild(node));

  const paragraphs = value
    .split(/\n{2,}/)
    .map((paragraphText) => paragraphText.trim())
    .map((paragraphText) => createParagraph(document, paragraphText));

  if (paragraphs.length === 0) {
    targetCell.appendChild(createParagraph(document, ""));
    return;
  }
  paragraphs.forEach((paragraph) => targetCell.appendChild(paragraph));
}

function replaceInterviewRecord(document: Document, body: Node, interviewRecord: string): void {
  const paragraphs = selectNodes(body, "./w:p") as Element[];
  const titleParagraph = paragraphs.find((paragraph) =>
    getNodeText(paragraph).replace(/\s+/g, "") === "訪談記錄:",
  );

  if (!titleParagraph || !titleParagraph.parentNode) {
    throw new Error("找不到訪談記錄段落。");
  }

  const siblingParagraph = titleParagraph.nextSibling;
  if (siblingParagraph && siblingParagraph.nodeName === "w:p") {
    titleParagraph.parentNode.removeChild(siblingParagraph);
  }

  const sectionNode = selectNodes(body, "./w:sectPr")[0];
  const paragraphTexts = interviewRecord
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  const nodesToInsert =
    paragraphTexts.length > 0
      ? paragraphTexts.map((text) => createParagraph(document, text))
      : [createParagraph(document, "")];

  nodesToInsert.reverse().forEach((node) => {
    titleParagraph.parentNode?.insertBefore(node, sectionNode);
  });
}

export async function buildReportDocx(options: {
  manualFields: ManualFields;
  interviewRecord: string;
}): Promise<Buffer> {
  const templatePath = path.resolve("assets", "analysis-report-template.docx");
  const templateBuffer = await readFile(templatePath);
  const zip = await JSZip.loadAsync(templateBuffer);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) {
    throw new Error("讀取 Word 模板失敗。");
  }

  const document = new DOMParser().parseFromString(xml, "application/xml");
  const body = selectNodes(document, "/w:document/w:body")[0];
  if (!body) {
    throw new Error("找不到 Word 內容主體。");
  }
  const rows = selectNodes(document, "/w:document/w:body/w:tbl/w:tr");

  rows.forEach((row) => {
    const labelCell = selectNodes(row, "./w:tc[1]")[0];
    const label = getNodeText(labelCell).trim();
    if (label in options.manualFields) {
      replaceCellValue(document, row, options.manualFields[label as keyof ManualFields]);
    }
  });

  replaceInterviewRecord(document, body, options.interviewRecord);
  zip.file("word/document.xml", serializer.serializeToString(document));
  return zip.generateAsync({ type: "nodebuffer" });
}
