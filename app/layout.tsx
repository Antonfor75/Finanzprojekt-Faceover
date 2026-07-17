import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Manrope } from "next/font/google";
import "./globals.css";
import SWRegister from "@/components/SWRegister";
import KeyboardInset from "@/components/KeyboardInset";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Finanzen App",
  description: "Tracke deine Ausgaben",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Mein Cashflow",
  },
  icons: {
    apple: "/app-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // Tastatur verkleinert den Viewport, statt den Inhalt zu überdecken.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={`${geistSans.variable} ${geistMono.variable} ${manrope.variable}`}>
      <body className="antialiased">
        <SWRegister />
        <KeyboardInset />
        {children}
      </body>
    </html>
  );
}
