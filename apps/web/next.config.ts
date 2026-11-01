import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    '**.run.app',
    '**.vercel.app',
    '**.google.com',
    '**.googleusercontent.com',
  ],
  transpilePackages: [
    '@careflow/shared',
    '@careflow/validation',
    '@careflow/database',
    '@careflow/support-engine',
  ],
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

export default nextConfig;
