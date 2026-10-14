/** rspress.config.ts の source.define でビルド時に 1 度だけ固定される(SSG とクライアントで同一値) */
declare const __DEVPULSE_BUILD_TIME__: string | undefined;

export function getBuildTime(): Date {
  return new Date(
    typeof __DEVPULSE_BUILD_TIME__ === 'string'
      ? __DEVPULSE_BUILD_TIME__
      : '1970-01-01T00:00:00Z',
  );
}
