import { bindings, defineConfig, triggers } from 'cf/config';

export default defineConfig({
  worker: {
    name: 'devpulse',
    entrypoint: './src/worker/index.ts',
    compatibilityDate: '2026-10-06',
    observability: { enabled: true, traces: { enabled: true } },
    env: {
      SNAPSHOTS: bindings.kv(),
      ASSETS: bindings.assets(),
      REPORTS: bindings.d1({ name: 'devpulse-reports' }),
      AI: bindings.ai(),
      REPORTS_TOKEN: bindings.secret(),
      REPORT_SETTINGS: bindings.json({
        model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
        maxTokens: 1200,
        maxInputChars: 24000,
      }),
    },
    assets: { runWorkerFirst: ['/api/*', '/reports/*', '/rss/*'] },
    triggers: [
      triggers.scheduled({ schedule: '0 * * * *' }),
      triggers.scheduled({ schedule: '0 0 * * *' }),
    ],
  },
});
