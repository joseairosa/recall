import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Recall - Memory-as-a-Service for AI",
  description:
    "Give your AI agents persistent memory. Semantic search, multi-tenant isolation, and MCP protocol support.",
  keywords: [
    "AI memory",
    "MCP",
    "Model Context Protocol",
    "AI agents",
    "semantic search",
    "vector database",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}
