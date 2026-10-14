import { feedExcerpt } from '@devpulse/domain/reports/feed';
import { expect, it } from 'vitest';

it('makes a short preview without HTML or multiline formatting', () => {
  expect(feedExcerpt('  要約\n\n次の文。  ')).toBe('要約 次の文。');
  expect(feedExcerpt('<script>x</script> &')).toBe(
    '&#60;script&#62;x&#60;/script&#62; &#38;',
  );
});

it('limits the preview to 180 characters without breaking Unicode characters', () => {
  const result = feedExcerpt('🚀'.repeat(181));
  expect(Array.from(result)).toHaveLength(180);
  expect(result).toBe(`${'🚀'.repeat(179)}…`);
  expect(feedExcerpt('あ'.repeat(180))).toBe('あ'.repeat(180));
});
