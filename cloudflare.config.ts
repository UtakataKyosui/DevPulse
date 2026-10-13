import { defineConfig } from 'cf/config';

export default defineConfig({
  worker: {
    name: 'devpulse',
    compatibilityDate: '2026-10-06',
    observability: { enabled: true },
  },
});
