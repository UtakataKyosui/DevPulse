import { bindings, defineConfig, triggers } from 'cf/config';

export default defineConfig({
  worker: {
    name: 'devpulse',
    entrypoint: './src/worker/index.ts',
    compatibilityDate: '2026-10-06',
    observability: { enabled: true, traces: { enabled: true } },
    env: {
      SNAPSHOTS: bindings.kv(),
      CONFIG: bindings.kv(),
      ASSETS: bindings.assets(),
      REPORTS: bindings.d1({ name: 'devpulse-reports' }),
      AI: bindings.ai(),
      REPORTS_TOKEN: bindings.secret(),
      GITHUB_TOKEN: bindings.secret(),
      ADMIN_ALLOWED_EMAILS: bindings.secret(),
      // Fill in after creating the Access Application; empty keeps /admin closed (503).
      ACCESS_SETTINGS: bindings.json({ teamDomain: '', aud: '' }),
      // Owner whose public repositories can be added; never derived from the user.
      ADMIN_SETTINGS: bindings.json({ githubOwner: 'UtakataKyosui' }),
      REPORT_SETTINGS: bindings.json({
        model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
        maxTokens: 1200,
        maxInputChars: 24000,
      }),
    },
    assets: {
      runWorkerFirst: [
        '/',
        '/index.html',
        '/api/*',
        '/reports',
        '/reports/*',
        '/rss/*',
        '/admin*',
      ],
    },
    triggers: [
      triggers.scheduled({ schedule: '0 * * * *' }),
      triggers.scheduled({ schedule: '0 12 * * *' }),
    ],
  },
});
