import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Shakti — The AI Workforce That Never Sleeps",
  description:
    "143+ autonomous agents running real organizations. Zero human intervention. Shakti deploys AI agents across your entire organization — they hire, sell, build, support, and grow.",
  keywords: [
    "AI workforce",
    "autonomous agents",
    "AI automation",
    "enterprise AI",
    "AI operations",
  ],
  openGraph: {
    title: "Shakti — The AI Workforce That Never Sleeps",
    description:
      "143+ autonomous agents running real organizations. Zero human intervention.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <body className="min-h-screen bg-[#0a0a0a] text-white font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
