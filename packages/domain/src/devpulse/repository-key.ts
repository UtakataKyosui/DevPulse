/** GitHub の owner/repo は大文字小文字を区別しないため、照合・重複検出は正規化したキーで行う */
export function repositoryKey(repository: string): string {
  return repository.toLowerCase();
}
