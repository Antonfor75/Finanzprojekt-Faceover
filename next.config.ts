import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Node-only Pakete für den REWE-Import nicht bundeln, sondern zur Laufzeit
  // per require laden. imapflow zieht pino/thread-stream mit optionalen
  // Transports (z. B. pino-elasticsearch), die der Bundler sonst nicht auflöst.
  serverExternalPackages: ['imapflow', 'pino', 'thread-stream', 'mailparser', 'pdfjs-dist'],
  experimental: {
    // Kassenbon-Scan lädt Fotos/PDFs per Server Action hoch (Standard wären 1 MB). Vercel
    // nimmt pro Anfrage ohnehin höchstens ~4,5 MB an; der Browser verkleinert vorher
    // (utils/receiptScan/prepareImage.ts).
    serverActions: { bodySizeLimit: '4mb' },
  },
};

export default nextConfig;
