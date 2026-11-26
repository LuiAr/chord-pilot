/**
 * A beat clock. Each beat is scheduled at start + n x period rather than chained
 * from the previous timer, so late timers do not add up into drift. If the app
 * was held up for longer than a beat, the missed beats are skipped, not replayed:
 * the callback gets the beat that is due now, which may jump ahead by more than one.
 * A wait never exceeds one period, so a wall clock set backwards cannot stall it.
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
    const wait = t0 + beat * period - Date.now();
    timer = setTimeout(tick, Math.min(period, Math.max(0, wait)));
  };

  const tick = () => {
    timer = undefined;
    const due = Math.max(beat, Math.floor((Date.now() - t0) / period));
    beat = due + 1;
    schedule();
    onBeat(due);
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
