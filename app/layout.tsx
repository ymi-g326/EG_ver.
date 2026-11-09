import type { Metadata } from "next";
import "./globals.css";
import "./player-v2.css";

export const metadata: Metadata = {
  title: "EARTH GROOVE V2 — A continuous record of Earth",
  robots: { index: false, follow: false, noarchive: true },
  description:
    "てんこう2をレコードの針に。衛星の軌道と地球の風景から音楽を生み出す、N.U Cosmic Campus向けのEarth Groove。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
