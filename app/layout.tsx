import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skylark Drones | Business Intelligence Agent",
  description:
    "Founder-grade autonomous BI agent integrating live monday.com boards with deterministic metric math.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0A0A0A] text-[#EAEAEA] antialiased selection:bg-[#FF2A2A] selection:text-white">
        {children}
      </body>
    </html>
  );
}
