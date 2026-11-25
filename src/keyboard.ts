/**
 * The two-octave keyboard on the back display (160x80 grey; the right 12 px are
 * the firmware's status bar). Drawn from rectangles placed by x and y, so it needs
 * no font metrics. The keys never change and are drawn once; only the chord marks move.
 */
import type { Chord } from "./theory";

const WHITE = "#FFFFFFFF";
const BLACK = "#000000FF";

const KB_X = 4;
export const KB_Y = 42;
const WHITE_W = 10;
const WHITE_H = 33;
const BLACK_W = 6;
const BLACK_H = 20;
/** The root is underlined below the keyboard. */
const ROOT_BAR_Y = KB_Y + WHITE_H + 2;

/** White key index of each pitch class, -1 for a black key; and the white key each black key follows. */
const WHITE_OF_PC = [0, -1, 1, -1, 2, 3, -1, 4, -1, 5, -1, 6];
const BLACK_AFTER_WHITE: Record<number, number> = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 };

const isBlack = (n: number) => WHITE_OF_PC[n % 12] < 0;

/** Left edge of key `n` semitones above the keyboard's lowest C. */
function keyX(n: number): number {
  const octave = Math.floor(n / 12);
  const pc = n % 12;
  if (!isBlack(pc)) return KB_X + (octave * 7 + WHITE_OF_PC[pc]) * WHITE_W;
  return KB_X + (octave * 7 + BLACK_AFTER_WHITE[pc] + 1) * WHITE_W - BLACK_W / 2;
}

function rect(id: string, x: number, y: number, width: number, height: number, color: string, z: number) {
  return {
    id,
    type: "rectangle" as const,
    display: "back" as const,
    x,
    y,
    width,
    height,
    fill: "solid" as const,
    fill_colors: [color],
    border_width: 0,
    z_index: z,
  };
}

export function keyboardElements() {
  const els = [];
  for (let w = 0; w < 14; w++) {
    els.push({ ...rect(`kw${w}`, KB_X + w * WHITE_W, KB_Y, WHITE_W + 1, WHITE_H, WHITE, 0), border_width: 1, border_color: BLACK });
  }
  for (let n = 0; n < 24; n++) {
    if (isBlack(n)) els.push(rect(`kb${n}`, keyX(n), KB_Y, BLACK_W, BLACK_H, BLACK, 1));
  }
  return els;
}

/**
 * Dots on the chord's keys, voiced upwards from the root in the first octave
 * (a 7th chord spans at most 11 semitones, so it always fits), and a bar under the root.
 */
export function chordMarks(chord: Chord) {
  const size = 4;
  const marks = chord.offsets.map((offset, i) => {
    const n = chord.rootPc + offset;
    const black = isBlack(n);
    const keyW = black ? BLACK_W : WHITE_W;
    const bottom = KB_Y + (black ? BLACK_H : WHITE_H) - 3;
    return {
      ...rect(`dot${i}`, keyX(n) + Math.floor((keyW - size) / 2), bottom - size, size, size, black ? WHITE : BLACK, 2),
      radius: 2,
    };
  });
  const rootW = isBlack(chord.rootPc) ? BLACK_W : WHITE_W;
  marks.push({ ...rect("root_bar", keyX(chord.rootPc) + 1, ROOT_BAR_Y, rootW - 1, 2, WHITE, 2), radius: 0 });
  return marks;
}
