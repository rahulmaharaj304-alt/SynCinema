const csp = [
  "default-src 'self'", "script-src 'self' 'unsafe-inline' https://www.youtube.com https://player.vimeo.com",
  "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:", "media-src 'self' blob: data: https:",
  "connect-src 'self' https: wss:", "frame-src https:", "worker-src 'self' blob:", "font-src 'self' data:",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');
module.exports = {
  output: process.env.STANDALONE ? 'standalone' : undefined, reactStrictMode: true, poweredByHeader: false,
  async headers() {
    const h = [
      { key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }, { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), display-capture=(self), geolocation=()' },
    ];
    if (process.env.NODE_ENV === 'production') h.push({ key: 'Content-Security-Policy', value: csp });
    return [{ source: '/(.*)', headers: h }];
  },
};
