import type { NextConfig } from "next";

const contentSecurityPolicy = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.openai.com https://*.supabase.co https://*.upstash.io",
    [
        "frame-ancestors",
        "'self'",
        "https://dropshippinguniversity.mykajabi.com",
        "https://www.dsutraining.com",
    ].join(" "),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
].join("; ");

const securityHeaders = [
    {
        key: "Content-Security-Policy",
        value: contentSecurityPolicy,
    },
    {
        key: "X-Content-Type-Options",
        value: "nosniff",
    },
    {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
    },
    {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=()",
    },
];

const nextConfig: NextConfig = {
    async headers() {
        return [
            {
                source: "/embed",
                headers: securityHeaders,
            },
            {
                source: "/embed/:path*",
                headers: securityHeaders,
            },
        ];
    },
};

export default nextConfig;