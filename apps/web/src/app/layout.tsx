import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Ledger",
    template: "%s · Ledger",
  },
  description: "Double-entry accounting",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Ledger",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays available — capping it would fail WCAG 1.4.4.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfd" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1d21" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
}
