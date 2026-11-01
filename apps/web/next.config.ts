import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@careflow/shared',
    '@careflow/validation',
    '@careflow/database',
    '@careflow/support-engine',
  ],
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

export default nextConfig;
