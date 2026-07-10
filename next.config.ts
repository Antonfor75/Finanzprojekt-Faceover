import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Node-only Pakete für den REWE-Import nicht bundeln, sondern zur Laufzeit
  // per require laden. imapflow zieht pino/thread-stream mit optionalen
  // Transports (z. B. pino-elasticsearch), die der Bundler sonst nicht auflöst.
  serverExternalPackages: ['imapflow', 'pino', 'thread-stream', 'mailparser', 'pdfjs-dist'],
};

export default nextConfig;
