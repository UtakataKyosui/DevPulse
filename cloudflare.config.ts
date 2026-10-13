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
    },
    assets: { runWorkerFirst: ['/api/snapshots'] },
    triggers: [triggers.scheduled({ schedule: '0 * * * *' })],
  },
});
