/** Retry read-only source requests with bounded backoff; never retry mutations. */
export function isTransientSourceError(error: unknown): boolean {
  const value = error as { problem?: { retryable?: boolean }; status?: number };
  if (typeof value?.problem?.retryable === "boolean")
    return value.problem.retryable;
  return (
    [408, 429, 502, 503, 504].includes(value?.status ?? 0) ||
    /timed?\s*out|timeout|could not connect|network|fetch failed|failed to fetch|temporarily unavailable/i.test(
      error instanceof Error ? error.message : String(error),
    )
  );
}
export class ReadRetry {
  private attempts = new Map<string, number>();
  private pending = new Map<string, () => void>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private paused = false;
  constructor(private delays = [2000, 5000, 10000]) {}
  schedule(key: string, task: () => void) {
    const attempt = this.attempts.get(key) ?? 0;
    if (attempt >= this.delays.length) return false;
    this.pending.set(key, task);
    if (!this.paused && !this.timers.has(key))
      this.timers.set(
        key,
        setTimeout(() => {
          this.timers.delete(key);
          this.pending.delete(key);
          this.attempts.set(key, attempt + 1);
          task();
        }, this.delays[attempt]),
      );
    return true;
  }
  reset(key: string) {
    clearTimeout(this.timers.get(key));
    this.timers.delete(key);
    this.pending.delete(key);
    this.attempts.delete(key);
  }
  clear() {
    for (const key of new Set([
      ...this.attempts.keys(),
      ...this.pending.keys(),
    ]))
      this.reset(key);
  }
  pause(value: boolean) {
    this.paused = value;
    if (value) {
      for (const timer of this.timers.values()) clearTimeout(timer);
      this.timers.clear();
    } else for (const [key, task] of this.pending) this.schedule(key, task);
  }
}
