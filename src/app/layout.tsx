import type { Metadata, Viewport } from "next";

import { Attribution } from "@/components/Attribution";

import "./globals.css";

export const metadata: Metadata = {
  title: "BotC Grimoire",
  description:
    "A storyteller's digital grimoire for in-person Blood on the Clocktower games.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Attribution />
      </body>
    </html>
  );
}
