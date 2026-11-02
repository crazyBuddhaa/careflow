import { defineCloudflareConfig } from '@opennextjs/cloudflare';

const cloudflareConfig = defineCloudflareConfig({});

export default {
  ...cloudflareConfig,
  buildCommand: 'npx next build',
};
