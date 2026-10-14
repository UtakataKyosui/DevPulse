export type EnvPlace = 'github-variable' | 'github-secret' | 'worker-secret';

export type EnvItem = {
  place: EnvPlace;
  name: string;
  /** false の項目は未設定でも動作する(挙動は setup-checklist.md に記載)。 */
  required: boolean;
};

/** setup-checklist.md の本番設定項目と対応する。変更時は両方を更新する。 */
export const ENV_MANIFEST: readonly EnvItem[] = [
  { place: 'github-variable', name: 'DEVPULSE_SITE_URL', required: true },
  { place: 'github-secret', name: 'CLOUDFLARE_API_TOKEN', required: true },
  { place: 'github-secret', name: 'CLOUDFLARE_ACCOUNT_ID', required: true },
  { place: 'github-secret', name: 'REPORTS_TOKEN', required: true },
  { place: 'worker-secret', name: 'REPORTS_TOKEN', required: true },
  { place: 'worker-secret', name: 'GITHUB_TOKEN', required: false },
  { place: 'worker-secret', name: 'ACCESS_TEAM_DOMAIN', required: true },
  { place: 'worker-secret', name: 'ACCESS_AUD', required: true },
  { place: 'worker-secret', name: 'ADMIN_ALLOWED_EMAILS', required: true },
];

export type EnvStatus = 'ok' | 'missing' | 'optional-missing' | 'unknown';

/** present が null の設定先は取得できなかったことを表し、unknown とする。 */
export function evaluateEnv(
  present: Partial<Record<EnvPlace, ReadonlySet<string> | null>>,
): { item: EnvItem; status: EnvStatus }[] {
  return ENV_MANIFEST.map((item) => {
    const names = present[item.place];
    if (!names) return { item, status: 'unknown' };
    if (names.has(item.name)) return { item, status: 'ok' };
    return { item, status: item.required ? 'missing' : 'optional-missing' };
  });
}
