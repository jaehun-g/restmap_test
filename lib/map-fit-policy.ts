export type MapFitRequest = { sequence: number; fit: boolean };

/** Marker data can change without changing the user's current map center or zoom. */
export class MapFitPolicy {
  private source: unknown;
  private request: MapFitRequest | undefined;
  private initialized = false;
  private pending = false;

  update(
    source: unknown,
    request: MapFitRequest | undefined,
    deferred: boolean,
  ): boolean {
    const first = !this.initialized;
    if (first || source !== this.source) this.pending = true;
    if (!first && request !== this.request && request)
      this.pending = request.fit;
    this.initialized = true;
    this.source = source;
    this.request = request;
    if (deferred || !this.pending) return false;
    this.pending = false;
    return true;
  }
}
