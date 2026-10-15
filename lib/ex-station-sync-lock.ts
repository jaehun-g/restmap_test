export class ExStationSyncLock {
  private running = false;

  acquire() {
    if (this.running) return false;
    this.running = true;
    return true;
  }

  release() {
    this.running = false;
  }
}

const lockGlobal = globalThis as typeof globalThis & {exStationSyncLock?: ExStationSyncLock};

/** Shares one lock across development reloads in the current Node.js process. */
export function exStationSyncLock() {
  return (lockGlobal.exStationSyncLock ??= new ExStationSyncLock());
}
