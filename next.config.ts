import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    async headers() {
        return [
            {
                source: "/embed",
                headers: [
                    {
                        key: "Content-Security-Policy",
                        value: [
                            "default-src 'self'",
                            "script-src 'self' 'unsafe-inline'",
                            "style-src 'self' 'unsafe-inline'",
                            "img-src 'self' data: blob:",
                            "font-src 'self' data:",
                            "connect-src 'self' https://api.openai.com https://*.supabase.co https://*.upstash.io",
                            // TODO hier echte Domain hinzufügen
                            "frame-ancestors 'self' https://MANJEETS-KAJABI-DOMAIN.de https://*.mykajabi.com",
                            "object-src 'none'",
                            "base-uri 'self'",
                            "form-action 'self'",
                        ].join("; "),
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
                        value:
                            "camera=(), microphone=(), geolocation=(), payment=()",
                    },
                ],
            },
        ];
    },
};

export default nextConfig;