import { loadCategory, type Target } from './data.ts';

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Endless target supply. Each round picks a category uniformly (so 18 stadiums are not drowned
 * by 1000 towns), then draws from that category's shuffled bag; a bag refills only when empty,
 * so nothing repeats until you have seen the whole category.
 */
export class TargetDeck {
  private pools = new Map<string, Target[]>();
  private bags = new Map<string, Target[]>();
  private lastId: string | null = null;

  async load(categories: string[]): Promise<void> {
    const loaded = await Promise.all(categories.map(async (c) => [c, await loadCategory(c)] as const));
    this.pools = new Map(loaded);
    this.bags = new Map();
  }

  get categories(): string[] {
    return [...this.pools.keys()];
  }

  next(): Target {
    const cats = this.categories;
    const cat = cats[Math.floor(Math.random() * cats.length)];
    let bag = this.bags.get(cat);
    if (!bag || bag.length === 0) {
      bag = shuffle([...this.pools.get(cat)!]);
      if (bag.length > 1 && bag[bag.length - 1].id === this.lastId) bag.unshift(bag.pop()!);
      this.bags.set(cat, bag);
    }
    const t = bag.pop()!;
    this.lastId = t.id;
    return t;
  }
}
