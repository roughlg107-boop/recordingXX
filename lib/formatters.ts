const taipeiDateTimeFormatter = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Taipei"
});

const taipeiDateFormatter = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Taipei"
});

export function formatDisplayDate(value: string) {
  const date = new Date(value);
  return taipeiDateTimeFormatter.format(date);
}

export function formatVisitDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return taipeiDateFormatter.format(date);
}

export function getTodayInTaipei() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";

  return `${year}-${month}-${day}`;
}

export function formatReportActivityAction(action: string) {
  switch (action) {
    case "created":
      return "建立報告";
    case "processing_started":
      return "啟動處理";
    case "completed":
      return "完成處理";
    case "failed":
      return "處理失敗";
    case "downloaded_docx":
      return "下載 Word";
    default:
      return action;
  }
}
