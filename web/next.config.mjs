/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: false,
    externalDir: true,
    serverComponentsExternalPackages: ['puppeteer-extra', 'puppeteer-extra-plugin-stealth']
  }
};

export default nextConfig;
