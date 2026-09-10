import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareCloud Intake | Voice patient registration",
  description:
    "Patient registration through natural conversation, with confirmed records and a persistent REST API.",
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
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
