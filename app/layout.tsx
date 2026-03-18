import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "RecordingXX",
  description: "把拜訪錄音轉成企劃可直接接手的拜訪報告。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
