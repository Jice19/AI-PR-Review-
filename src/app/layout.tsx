import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/frontend/components/Providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "AI PR Review",
  description: "AI-powered Pull Request review assistant",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className={`${inter.className} ambient-bg min-h-screen`}>
        <Providers>
          <main className="min-h-screen">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
