import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist (Kontoauszug-Import) nicht bundeln, sondern zur Laufzeit per require laden.
  serverExternalPackages: ['pdfjs-dist'],
  experimental: {
    // Kassenbon-Scan lädt Fotos/PDFs per Server Action hoch (Standard wären 1 MB). Vercel
    // nimmt pro Anfrage ohnehin höchstens ~4,5 MB an; der Browser verkleinert vorher
    // (utils/receiptScan/prepareImage.ts).
    serverActions: { bodySizeLimit: '4mb' },
  },
};

export default nextConfig;
