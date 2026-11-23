export interface PostLike {
  id: string;
  data: { pubDate: Date; draft?: boolean };
}

/** Published posts only (not drafts, not future-dated), newest first. */
export function publishedPosts<T extends PostLike>(posts: T[], now: Date = new Date()): T[] {
  return posts
    .filter((p) => !p.data.draft && p.data.pubDate.getTime() <= now.getTime())
    .sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
