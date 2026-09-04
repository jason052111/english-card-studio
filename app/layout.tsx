import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "English Card Studio",
  description: "Create personal English vocabulary cards with Supabase accounts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
