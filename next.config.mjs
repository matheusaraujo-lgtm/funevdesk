/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "bcryptjs", "pg", "nexus-desk-db"],
  async headers() {
    const baseSecurity = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
      { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
    ];
    return [
      { source: "/:path*", headers: baseSecurity },
      // Conteúdo enviado por usuários: nunca interpretar como HTML executável.
      {
        source: "/uploads/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Content-Security-Policy", value: "default-src 'none'; sandbox; img-src 'self'; media-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
