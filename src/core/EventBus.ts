type Listener<T> = (payload: T) => void;

/**
 * Minimal typed event bus. It is the only channel between the Phaser runtime
 * and the DOM UI, which keeps the two sides from reaching into each other.
 */
export class EventBus<Events extends Record<keyof Events, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => this.off(event, listener);
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    this.listeners.get(event)?.delete(listener as Listener<never>);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        (listener as Listener<Events[K]>)(payload);
      } catch (error) {
        console.error(`[dungeon.md] listener for "${String(event)}" failed`, error);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
