/**
 * A beat clock. Each beat is scheduled at start + n x period rather than chained
 * from the previous timer, so late timers do not add up into drift. If the app
 * was held up for longer than a beat, the missed beats are skipped, not replayed.
 */
export type BeatClock = {
  /** Starts counting from beat 0 now. Restarts if already running. */
  start(): void;
  stop(): void;
  readonly running: boolean;
};

export function beatClock(periodMs: () => number, onBeat: (beat: number) => void): BeatClock {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let t0 = 0;
  let beat = 0;
  let period = 0;

  const schedule = () => {
    timer = setTimeout(tick, Math.max(0, t0 + beat * period - Date.now()));
  };

  const tick = () => {
    timer = undefined;
    const current = beat;
    const due = Math.floor((Date.now() - t0) / period);
    beat = Math.max(current + 1, due + 1);
    schedule();
    onBeat(current);
  };

  const stop = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  return {
    start() {
      stop();
      period = periodMs();
      t0 = Date.now();
      beat = 0;
      tick();
    },
    stop,
    get running() {
      return timer !== undefined;
    },
  };
}
