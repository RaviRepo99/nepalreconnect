import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Nepal Reconnect | Find Missing Loved Ones in Nepal",
    template: "%s | Nepal Reconnect",
  },
  description: "Nepal Reconnect is a trusted public service to report missing people, share found-person reports, search verified information and help families reconnect across Nepal.",
  keywords: [
    "Nepal missing person report",
    "find missing people Nepal",
    "missing loved ones Nepal",
    "found person report Nepal",
    "family reunification Nepal",
    "Nepal Reconnect",
  ],
  authors: [{ name: "Mitesh Mandal" }],
  creator: "Mitesh Mandal",
  publisher: "Nepal Reconnect",
  applicationName: "Nepal Reconnect",
  category: "Public service",
  icons: {
    icon: "/icon.svg",
  },
  metadataBase: new URL(process.env.SITE_URL || "http://localhost:3000"),
  openGraph: {
    type: "website",
    locale: "en_NP",
    url: "/",
    siteName: "Nepal Reconnect",
    title: "Nepal Reconnect | Find Missing Loved Ones in Nepal",
    description: "Report, search and safely reconnect families across Nepal.",
    images: [{ url: "/media/banner2.png", width: 1664, height: 941, alt: "Nepal Reconnect family reconnection service" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nepal Reconnect | Find Missing Loved Ones in Nepal",
    description: "Report, search and safely reconnect families across Nepal.",
    images: ["/media/banner2.png"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
