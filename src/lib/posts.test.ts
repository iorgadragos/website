import { describe, expect, it } from 'vitest';
import { formatDate, publishedPosts } from './posts';

const post = (id: string, date: string, draft = false) => ({ id, data: { pubDate: new Date(date), draft } });

describe('publishedPosts', () => {
  const now = new Date('2027-02-10T00:00:00Z');
  it('drops drafts and future posts and sorts newest first', () => {
    const result = publishedPosts(
      [post('a', '2027-01-01'), post('b', '2027-02-01'), post('c', '2027-01-15', true), post('d', '2027-03-01')],
      now,
    );
    expect(result.map((p) => p.id)).toEqual(['b', 'a']);
  });
  it('returns an empty list when nothing is published', () => {
    expect(publishedPosts([post('x', '2027-05-01')], now)).toEqual([]);
  });
});

describe('formatDate', () => {
  it('formats in UTC, en-GB', () => {
    expect(formatDate(new Date('2027-02-01T00:00:00Z'))).toBe('1 Feb 2027');
  });
});
