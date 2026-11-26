/**
 * What the two displays show for a practice state. Pure: builds elements, sends nothing.
 *
 * Front, 72x16 colour: the current chord large, coloured by its function; on the
 * right the next chord (or the count-in, or the new key), the progression's steps,
 * and along the bottom edge one segment per beat of the chord while playing.
 * Back, 160x80 grey: progression, key, chord, numeral, tones, tempo and the keyboard.
 */
import { column, render, row, type Node } from "@busy-app/busy-lib";
import { chordMarks } from "./keyboard";
import { keyName, symbol, type Chord, type Progression, type Role } from "./theory";

export const MAX_BEATS = 8;

const WHITE = "#FFFFFFFF";
const DIM = "#FFFFFF66";
const FAINT = "#FFFFFF26";
const NONE = "#00000000";

/** The eye learns each function's colour, in every key. */
const ROLE_COLOR: Record<Role, string> = {
  predominant: "#3FA9F5FF",
  dominant: "#FF8C1AFF",
  tonic: "#3DDC84FF",
  relative: "#B57BFFFF",
};

export type View = {
  prog: Progression;
  key: number;
  step: number;
  chords: Chord[];
  next: Chord;
  /** The next chord is the first of a new key. */
  nextInNewKey: boolean;
  /** Show the key name where the next chord goes. */
  flashKey: boolean;
  playing: boolean;
  /** Beats left in the count-in, or 0 once the chords run. */
  countIn: number;
  /** Beat within the current chord, from 0. */
  beat: number;
  beatsPerChord: number;
  tempo: number;
};

function rightLabel(v: View): { text: string; color: string } {
  if (v.countIn > 0) return { text: `in ${v.countIn}`, color: WHITE };
  if (v.flashKey) return { text: `key ${keyName(v.key, v.prog.mode)}${v.prog.mode === "minor" ? "m" : ""}`, color: WHITE };
  return { text: symbol(v.next), color: v.nextInNewKey ? WHITE : DIM };
}

/** The count-in is one bar of four beats, whatever the beats per chord. */
export const COUNT_IN = 4;

/**
 * Bottom edge: one segment per beat; passed beats lit in the chord's colour (white
 * during the count-in). Hidden while paused.
 */
function beatBar(v: View, color: string) {
  const segments = v.countIn > 0 ? COUNT_IN : v.beatsPerChord;
  const width = Math.floor(72 / segments);
  const els = [];
  for (let i = 0; i < MAX_BEATS; i++) {
    const shown = v.playing && i < segments;
    const lit = v.countIn > 0 ? i <= COUNT_IN - v.countIn : i <= v.beat;
    // Segments not in use stay on screen, transparent.
    const inUse = i < segments;
    els.push({
      id: `f_beat${i}`,
      type: "rectangle" as const,
      x: inUse ? i * width : 0,
      y: 15,
      width: inUse ? width - 1 : 1,
      height: 1,
      fill: "solid" as const,
      fill_colors: [!shown ? NONE : lit ? (v.countIn > 0 ? WHITE : color) : FAINT],
      border_width: 0,
    });
  }
  return els;
}

export function frontElements(v: View) {
  const chord = v.chords[v.step];
  const color = ROLE_COLOR[chord.role];
  const dots: Node[] = [];
  for (let i = 0; i < 4; i++) {
    const shown = i < v.chords.length;
    dots.push({
      type: "rectangle",
      id: `f_dot${i}`,
      width: i === v.step ? 4 : 2,
      height: 2,
      fill: "solid",
      fill_colors: [!shown ? NONE : i === v.step ? ROLE_COLOR[v.chords[i].role] : DIM],
      border_width: 0,
    });
  }
  const label = rightLabel(v);
  const tree = row({ justify: "between", align: "center", width: 72, height: 15, dx: 1 }, [
    row({ align: "baseline", gap: 1 }, [
      { type: "text", id: "f_root", text: chord.root, font: "large", color },
      { type: "text", id: "f_qual", text: chord.quality, font: "small", color },
    ]),
    column({ align: "end", gap: 3, dx: -2 }, [
      { type: "text", id: "f_next", text: label.text, font: "tiny", color: label.color },
      row({ align: "center", gap: 1 }, dots),
    ]),
  ]);
  return [...render(tree), ...beatBar(v, color)];
}

export function backElements(v: View) {
  const chord = v.chords[v.step];
  // Placed by x, y and align, not laid out. Only the fonts the front's layout already uses:
  // the build bundles metrics (heap) for every font named under src/.
  const text = (id: string, t: string, x: number, y: number, align: "top_left" | "top_right") => ({
    id,
    type: "text" as const,
    display: "back" as const,
    text: t,
    color: WHITE,
    x,
    y,
    align,
  });
  const status = `${v.playing ? ">" : "||"} ${v.tempo} bpm`;
  return [
    { ...text("b_prog", v.prog.name, 2, 1, "top_left"), font: "small" as const },
    { ...text("b_key", `${keyName(v.key, v.prog.mode)} ${v.prog.mode}`, 146, 1, "top_right"), font: "small" as const },
    { ...text("b_chord", symbol(chord), 2, 13, "top_left"), font: "large" as const },
    { ...text("b_step", `${chord.numeral}  ${v.step + 1}/${v.chords.length}`, 146, 15, "top_right"), font: "small" as const },
    { ...text("b_tones", chord.tones.join("   "), 2, 28, "top_left"), font: "small" as const },
    { ...text("b_status", status, 146, 28, "top_right"), font: "small" as const },
    ...chordMarks(chord),
  ];
}
