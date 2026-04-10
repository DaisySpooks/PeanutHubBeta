import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Peanut Hub",
  description: "A cinematic landing page for the Peanut Hub universe.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
