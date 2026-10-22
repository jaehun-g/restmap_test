/** 브라우저 세션 안에서만 검색 결과를 재사용하며 위치별 키와 저장 개수를 제한한다. */
export class QueryCache<T> {
  private entries = new Map<string, {value: T; expiresAt: number}>();
  private ttl: number;
  private maxEntries: number;
  private now: () => number;
  constructor(ttl = 30_000, maxEntries = 20, now: () => number = Date.now) {
    this.ttl = ttl;
    this.maxEntries = maxEntries;
    this.now = now;
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T) {
    this.entries.delete(key);
    this.entries.set(key, {value, expiresAt: this.now() + this.ttl});
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
  }

  clear() {
    this.entries.clear();
  }
}
