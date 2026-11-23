import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (database locale) e react-pdf vanno caricati da Node, non impacchettati.
  serverExternalPackages: ["@electric-sql/pglite", "@react-pdf/renderer"],
};

export default nextConfig;
