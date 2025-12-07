/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    GOOGLE_LOGIN_OAUTH_REDIRECT_URI: process.env.GOOGLE_LOGIN_OAUTH_REDIRECT_URI
  },
  // Keep externalDir and typedRoutes if needed, but remove serverComponentsExternalPackages
  experimental: {
    typedRoutes: false,
    externalDir: true,
    // serverComponentsExternalPackages will be handled by the webpack function below
  },
  
  // Use the Webpack configuration function for explicit externalization
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Add the problematic packages to Webpack's 'externals' list
      // This tells Webpack to skip bundling these packages and load them 
      // as regular Node.js modules at runtime.
      config.externals.push(
        'puppeteer-extra', 
        'puppeteer-extra-plugin-stealth', 
        'clone-deep', 
        'merge-deep'
      );
    }
    return config;
  },
};

export default nextConfig;
