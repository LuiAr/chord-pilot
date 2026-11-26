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
/** Upper bound on chord changes caught up in one beat, should the clock jump far ahead. */
const MAX_CATCH_UP = 48;

type AfterRound = "fourth" | "semitone" | "stay";
const KEY_SHIFT: Record<AfterRound, number> = { fourth: 5, semitone: 1, stay: 0 };

type Config = { tempo: number; beats: number; afterRound: AfterRound };
const DEFAULTS: Config = { tempo: 80, beats: 4, afterRound: "fourth" };

const isAfterRound = (value: string): value is AfterRound =>
  Object.prototype.hasOwnProperty.call(KEY_SHIFT, value);

function readConfig(values: Record<string, unknown> | null): Config {
  if (!values) return DEFAULTS;
  const tempo = Number(values.tempo);
  const beats = Number(values.beats);
  const after = String(values.after_round);
  return {
    tempo: tempo >= 40 && tempo <= 200 ? tempo : DEFAULTS.tempo,
    beats: beats === 2 || beats === 4 || beats === 8 ? beats : DEFAULTS.beats,
    afterRound: isAfterRound(after) ? after : DEFAULTS.afterRound,
  };
}

function loadPosition(): { key: number; prog: number } {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { key?: unknown; prog?: unknown };
      const key = Number(saved.key);
      const prog = Number(saved.prog);
      const valid =
        Number.isInteger(key) && key >= 0 && key < 12 && Number.isInteger(prog) && prog >= 0 && prog < PROGRESSIONS.length;
      if (valid) return { key, prog };
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

  /** Controls wait for the settings, so that play never starts at the wrong tempo. */
  let ready = false;
  let playing = false;
  /** Beats of count-in before the chords: a bar after Start, none after a manual step. */
  let countInBeats = 0;
  let countIn = 0;
  let beat = 0;
  /** Chords played since the beat started, to count the changes when beats are skipped. */
  let chordsPlayed = 0;
  let flashKey = false;

  let stopped = false;
  let drawing = false;
  let dirty = false;
  let backDirty = true;
  /** The key or progression changed since the last save. */
  let unsaved = false;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  const report = (err: unknown) =>
    console.error(`${APP}: ${String((err as { message?: unknown })?.message ?? err)}`);

  const beatMs = () => 60000 / config.tempo;

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
    let elements;
    const withBack = backDirty;
    try {
      const v = view();
      elements = withBack ? [...frontElements(v), ...backElements(v)] : frontElements(v);
    } catch (err) {
      report(err);
      return;
    }
    drawing = true;
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
      // The back was not updated: send it again with the next frame.
      if (withBack) backDirty = true;
      done();
    });
  };

  const save = () => {
    if (saveTimer !== undefined) clearTimeout(saveTimer);
    saveTimer = undefined;
    unsaved = false;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ key, prog }));
    } catch (err) {
      report(err);
    }
  };

  /**
   * Flash is rewritten on every save, so it waits until a choice made with the
   * controls has settled. Key changes made by the beat are saved on pause or exit.
   */
  const changed = (byControl: boolean) => {
    unsaved = true;
    if (!byControl) return;
    if (saveTimer !== undefined) clearTimeout(saveTimer);
    saveTimer = setTimeout(save, SAVE_DELAY_MS);
  };

  /** Shows the key's name on the front for a moment, where the next chord goes; while playing, for one chord at most. */
  const showKey = () => {
    flashKey = true;
    if (flashTimer !== undefined) clearTimeout(flashTimer);
    const duration = playing ? Math.min(KEY_FLASH_MS, config.beats * beatMs()) : KEY_FLASH_MS;
    flashTimer = setTimeout(() => {
      flashTimer = undefined;
      flashKey = false;
      requestDraw(false);
    }, duration);
  };

  const advance = (byControl: boolean) => {
    const np = nextPosition();
    if (np.key !== key) {
      showKey();
      changed(byControl);
    }
    key = np.key;
    step = np.step;
  };

  const clock = beatClock(beatMs, (b) => {
    if (b < countInBeats) {
      countIn = countInBeats - b;
      beat = 0;
      requestDraw(b === 0);
      return;
    }
    const pos = b - countInBeats;
    const chord = Math.floor(pos / config.beats);
    const changes = Math.min(chord - chordsPlayed, MAX_CATCH_UP);
    for (let i = 0; i < changes; i++) advance(false);
    chordsPlayed = chord;
    countIn = 0;
    beat = pos % config.beats;
    requestDraw(changes > 0 || pos === 0);
  });

  const startBeat = (withCountIn: boolean) => {
    countInBeats = withCountIn ? COUNT_IN : 0;
    chordsPlayed = 0;
    clock.start();
  };

  const quit = () => {
    stopped = true;
    clock.stop();
    if (flashTimer !== undefined) clearTimeout(flashTimer);
    flashTimer = undefined;
    if (unsaved) save();
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
    ready = true;
    requestDraw(true);
  };
  startUp().catch(report);

  const unbind = listen("input", (event) => {
    if (stopped) return;
    if (!ready && event.key !== "back") return;

    if (event.key === "encoder") {
      key = (key + (event.delta > 0 ? 1 : 11)) % 12;
      showKey();
      changed(true);
      requestDraw(true);
      return;
    }

    if (event.key === "ok" && event.action === "long") {
      prog = (prog + 1) % PROGRESSIONS.length;
      step = 0;
      changed(true);
      if (playing) startBeat(false);
      else requestDraw(true);
      return;
    }
    if (event.action !== "short") return;

    if (event.key === "start") {
      playing = !playing;
      if (playing) {
        startBeat(true);
      } else {
        clock.stop();
        countIn = 0;
        beat = 0;
        if (unsaved) save();
        requestDraw(true);
      }
    } else if (event.key === "ok") {
      advance(true);
      if (playing) startBeat(false);
      else requestDraw(true);
    } else if (event.key === "back") {
      quit();
      // Not detached from inside the handler itself: the unbind would stop the app while this handler runs.
      setTimeout(unbind, 0);
    }
  });
}

main();
