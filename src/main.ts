/**
 * Chord Pilot: practise chord progressions through every key, hands free.
 *
 * Start plays or pauses (one bar of count-in, then the chords change on the beat),
 * the wheel changes key, OK steps to the next chord, holding OK changes progression,
 * Back exits. Tempo, beats per chord and the key order are the app's settings.
 */
import { device } from "@shared/device";
import { loadValues } from "@shared/settings";
import manifest from "./appmeta/manifest.json";
import { beatClock } from "./clock";
import { keyboardElements } from "./keyboard";
import { COUNT_IN, backElements, frontElements, type View } from "./screens";
import { PROGRESSIONS, chordAt } from "./theory";

/** The name the app draws under; the device clears elements by this id. */
const APP = manifest.id;
const STORE_KEY = "state";
const SAVE_DELAY_MS = 4000;
const KEY_FLASH_MS = 1500;

type AfterRound = "fourth" | "semitone" | "stay";
const KEY_SHIFT: Record<AfterRound, number> = { fourth: 5, semitone: 1, stay: 0 };

type Config = { tempo: number; beats: number; afterRound: AfterRound };
const DEFAULTS: Config = { tempo: 80, beats: 4, afterRound: "fourth" };

function readConfig(values: Record<string, unknown> | null): Config {
  if (!values) return DEFAULTS;
  const tempo = Number(values.tempo);
  const beats = Number(values.beats);
  const after = String(values.after_round);
  return {
    tempo: tempo >= 40 && tempo <= 200 ? tempo : DEFAULTS.tempo,
    beats: beats === 2 || beats === 4 || beats === 8 ? beats : DEFAULTS.beats,
    afterRound: after in KEY_SHIFT ? (after as AfterRound) : DEFAULTS.afterRound,
  };
}

function loadPosition(): { key: number; prog: number } {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { key?: unknown; prog?: unknown };
      const key = Number(saved.key);
      const prog = Number(saved.prog);
      if (key >= 0 && key < 12 && prog >= 0 && prog < PROGRESSIONS.length) return { key, prog };
    }
  } catch {
    // A missing or damaged store starts from C and the first progression.
  }
  return { key: 0, prog: 0 };
}

function main(): void {
  let config = DEFAULTS;
  const start = loadPosition();
  let key = start.key;
  let prog = start.prog;
  let step = 0;

  let playing = false;
  /** Beats of count-in before the chords: a bar after Start, none after a manual step. */
  let countInBeats = 0;
  let countIn = 0;
  let beat = 0;
  let flashKey = false;

  let stopped = false;
  let drawing = false;
  let dirty = false;
  let backDirty = true;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  const report = (err: unknown) =>
    console.error(`${APP}: ${String((err as { message?: unknown })?.message ?? err)}`);

  /** Where Start or the beat goes after the current chord. */
  const nextPosition = () => {
    const steps = PROGRESSIONS[prog].steps.length;
    return step + 1 < steps
      ? { key, step: step + 1 }
      : { key: (key + KEY_SHIFT[config.afterRound]) % 12, step: 0 };
  };

  const view = (): View => {
    const p = PROGRESSIONS[prog];
    const np = nextPosition();
    return {
      prog: p,
      key,
      step,
      chords: p.steps.map((_, i) => chordAt(p, key, i)),
      next: chordAt(p, np.key, np.step),
      nextInNewKey: np.key !== key,
      flashKey,
      playing,
      countIn,
      beat,
      beatsPerChord: config.beats,
      tempo: config.tempo,
    };
  };

  /**
   * At most one draw in flight; changes made meanwhile are drawn once it is done.
   * Beats redraw only the front; the back is sent when its content changed.
   */
  const requestDraw = (back: boolean) => {
    if (stopped) return;
    backDirty = backDirty || back;
    if (drawing) {
      dirty = true;
      return;
    }
    drawing = true;
    const v = view();
    const elements = backDirty ? [...frontElements(v), ...backElements(v)] : frontElements(v);
    backDirty = false;
    const done = () => {
      drawing = false;
      if (dirty) {
        dirty = false;
        requestDraw(false);
      }
    };
    device.DisplayDraw({ application_name: APP, priority: 50, elements }).then(done, (err) => {
      report(err);
      done();
    });
  };

  const save = () => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ key, prog }));
    } catch (err) {
      report(err);
    }
  };

  /** Flash is rewritten on every save, so only once the choice has settled. */
  const scheduleSave = () => {
    if (saveTimer !== undefined) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      save();
    }, SAVE_DELAY_MS);
  };

  /** Shows the key's name on the front for a moment, where the next chord goes. */
  const showKey = () => {
    flashKey = true;
    if (flashTimer !== undefined) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flashTimer = undefined;
      flashKey = false;
      requestDraw(false);
    }, KEY_FLASH_MS);
  };

  const advance = () => {
    const np = nextPosition();
    if (np.key !== key) {
      showKey();
      scheduleSave();
    }
    key = np.key;
    step = np.step;
  };

  const clock = beatClock(
    () => 60000 / config.tempo,
    (b) => {
      if (b < countInBeats) {
        countIn = countInBeats - b;
        beat = 0;
        requestDraw(b === 0);
        return;
      }
      const pos = b - countInBeats;
      const changes = pos > 0 && pos % config.beats === 0;
      if (changes) advance();
      countIn = 0;
      beat = pos % config.beats;
      requestDraw(changes || pos === 0);
    },
  );

  /** Restarts the beat on the current chord, without count-in: after a manual change while playing. */
  const restartBeat = () => {
    countInBeats = 0;
    clock.start();
  };

  const quit = () => {
    stopped = true;
    clock.stop();
    if (flashTimer !== undefined) clearTimeout(flashTimer);
    flashTimer = undefined;
    if (saveTimer !== undefined) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
      save();
    }
  };

  // One request at a time at launch: settings, then the keyboard, then the first frame.
  // In parallel they would hold three requests' memory at once.
  const startUp = async () => {
    config = readConfig(await loadValues());
    if (stopped) return;
    try {
      await device.DisplayDraw({ application_name: APP, priority: 50, elements: keyboardElements() });
    } catch (err) {
      report(err);
    }
    requestDraw(true);
  };
  startUp().catch(report);

  const unbind = listen("input", (event) => {
    if (stopped) return;

    if (event.key === "encoder") {
      key = (key + (event.delta > 0 ? 1 : 11)) % 12;
      showKey();
      scheduleSave();
      requestDraw(true);
      return;
    }

    if (event.key === "ok" && event.action === "long") {
      prog = (prog + 1) % PROGRESSIONS.length;
      step = 0;
      scheduleSave();
      if (playing) restartBeat();
      else requestDraw(true);
      return;
    }
    if (event.action !== "short") return;

    if (event.key === "start") {
      playing = !playing;
      if (playing) {
        countInBeats = COUNT_IN;
        clock.start();
      } else {
        clock.stop();
        countIn = 0;
        beat = 0;
        requestDraw(true);
      }
    } else if (event.key === "ok") {
      advance();
      if (playing) restartBeat();
      else requestDraw(true);
    } else if (event.key === "back") {
      quit();
      // Not detached from inside the handler itself: the unbind would stop the app while this handler runs.
      setTimeout(unbind, 0);
    }
  });
}

main();
