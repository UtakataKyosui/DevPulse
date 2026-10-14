/** A short, plain-text preview; readers follow the item link for the full report. */
export function feedExcerpt(summary: string): string {
  const characters = Array.from(summary.replace(/\s+/g, ' ').trim());
  const text =
    characters.length > 180
      ? `${characters.slice(0, 179).join('')}…`
      : characters.join('');
  // RSS readers may interpret description as HTML, so escape even plain text.
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
