/**
 * Chord spelling for Chord Pilot.
 *
 * Notes are spelled by letter arithmetic, never looked up from a pitch class:
 * a chord's 3rd is always the root's letter + 2, its 5th + 4, its 7th + 6, and
 * the accidental is whatever makes the letter land on the right pitch. That is
 * why C#7 contains E# and Abm7 contains Cb, as a musician would write them.
 */

/** Letters C D E F G A B as 0..6, with their natural pitch classes. */
const LETTERS = "CDEFGAB";
const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];

export type Note = { letter: number; acc: number };

/** One chord tone: how many letters and semitones above the root. */
type Interval = { steps: number; semis: number };

export type Quality = "maj7" | "m7" | "7" | "m7b5";

const QUALITY_TONES: Record<Quality, Interval[]> = {
  maj7: [{ steps: 0, semis: 0 }, { steps: 2, semis: 4 }, { steps: 4, semis: 7 }, { steps: 6, semis: 11 }],
  m7: [{ steps: 0, semis: 0 }, { steps: 2, semis: 3 }, { steps: 4, semis: 7 }, { steps: 6, semis: 10 }],
  "7": [{ steps: 0, semis: 0 }, { steps: 2, semis: 4 }, { steps: 4, semis: 7 }, { steps: 6, semis: 10 }],
  m7b5: [{ steps: 0, semis: 0 }, { steps: 2, semis: 3 }, { steps: 4, semis: 6 }, { steps: 6, semis: 10 }],
};

/** What a chord does in its key; the front display colours chords by it. */
export type Role = "tonic" | "predominant" | "dominant" | "relative";

type Step = { numeral: string; degree: Interval; quality: Quality; role: Role };

export type Progression = { name: string; mode: "major" | "minor"; steps: Step[] };

export const PROGRESSIONS: Progression[] = [
  {
    name: "ii-V-I",
    mode: "major",
    steps: [
      { numeral: "ii", degree: { steps: 1, semis: 2 }, quality: "m7", role: "predominant" },
      { numeral: "V", degree: { steps: 4, semis: 7 }, quality: "7", role: "dominant" },
      { numeral: "I", degree: { steps: 0, semis: 0 }, quality: "maj7", role: "tonic" },
    ],
  },
  {
    name: "minor ii-V-i",
    mode: "minor",
    steps: [
      { numeral: "ii", degree: { steps: 1, semis: 2 }, quality: "m7b5", role: "predominant" },
      { numeral: "V", degree: { steps: 4, semis: 7 }, quality: "7", role: "dominant" },
      { numeral: "i", degree: { steps: 0, semis: 0 }, quality: "m7", role: "tonic" },
    ],
  },
  {
    name: "I-vi-ii-V",
    mode: "major",
    steps: [
      { numeral: "I", degree: { steps: 0, semis: 0 }, quality: "maj7", role: "tonic" },
      { numeral: "vi", degree: { steps: 5, semis: 9 }, quality: "m7", role: "relative" },
      { numeral: "ii", degree: { steps: 1, semis: 2 }, quality: "m7", role: "predominant" },
      { numeral: "V", degree: { steps: 4, semis: 7 }, quality: "7", role: "dominant" },
    ],
  },
];

/**
 * The key's tonic for each pitch class, as usually written. Chosen so that no
 * chord of any progression needs a double sharp or flat (verified by
 * `verifyAll`): G# minor would need F## in its D#7, so minor uses Ab instead.
 */
const MAJOR_KEYS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MINOR_KEYS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

const mod = (n: number, m: number) => ((n % m) + m) % m;

export function pitchClass(note: Note): number {
  return mod(NATURAL_PC[note.letter] + note.acc, 12);
}

export function noteName(note: Note): string {
  const sign = note.acc > 0 ? "#" : "b";
  let out = LETTERS[note.letter];
  for (let i = 0; i < Math.abs(note.acc); i++) out += sign;
  return out;
}

export function parseNote(name: string): Note {
  const letter = LETTERS.indexOf(name[0]);
  let acc = 0;
  for (let i = 1; i < name.length; i++) acc += name[i] === "#" ? 1 : -1;
  return { letter, acc };
}

/** The note `interval` above `from`, spelled by letter. */
function above(from: Note, interval: Interval): Note {
  const letter = mod(from.letter + interval.steps, 7);
  const target = mod(pitchClass(from) + interval.semis, 12);
  // The accidental that moves the natural letter onto the target, kept in -6..5.
  const acc = mod(target - NATURAL_PC[letter] + 6, 12) - 6;
  return { letter, acc };
}

export function keyName(tonicPc: number, mode: "major" | "minor"): string {
  return (mode === "major" ? MAJOR_KEYS : MINOR_KEYS)[mod(tonicPc, 12)];
}

export type Chord = {
  numeral: string;
  role: Role;
  root: string;
  quality: Quality;
  /** Chord tones, root first, spelled. */
  tones: string[];
  /** Root's pitch class and the tones' semitones above it, for the keyboard. */
  rootPc: number;
  offsets: number[];
};

export function chordAt(progression: Progression, tonicPc: number, index: number): Chord {
  const tonic = parseNote(keyName(tonicPc, progression.mode));
  const step = progression.steps[index];
  const root = above(tonic, step.degree);
  const intervals = QUALITY_TONES[step.quality];
  return {
    numeral: step.numeral,
    role: step.role,
    root: noteName(root),
    quality: step.quality,
    tones: intervals.map((iv) => noteName(above(root, iv))),
    rootPc: pitchClass(root),
    offsets: intervals.map((iv) => iv.semis),
  };
}

/** The chord symbol as written on a lead sheet, in ASCII. */
export function symbol(chord: Chord): string {
  return chord.root + chord.quality;
}

/**
 * Checks every chord of every progression in all 12 keys, from the spelled
 * names back: letters stack in thirds, pitches match the chord formula, and
 * no note needs a double accidental. Returns one line per problem.
 */
export function verifyAll(): string[] {
  const problems: string[] = [];
  for (const prog of PROGRESSIONS) {
    for (let pc = 0; pc < 12; pc++) {
      const tonic = parseNote(keyName(pc, prog.mode));
      if (pitchClass(tonic) !== pc) problems.push(`${prog.name}: key ${keyName(pc, prog.mode)} is not pc ${pc}`);
      for (let i = 0; i < prog.steps.length; i++) {
        const chord = chordAt(prog, pc, i);
        const notes = chord.tones.map(parseNote);
        const expectedRoot = mod(pc + prog.steps[i].degree.semis, 12);
        const label = `${prog.name} in ${keyName(pc, prog.mode)}: ${symbol(chord)}`;
        if (pitchClass(notes[0]) !== expectedRoot) problems.push(`${label} root is off`);
        notes.forEach((n, t) => {
          const iv = QUALITY_TONES[chord.quality][t];
          if (mod(n.letter - notes[0].letter, 7) !== iv.steps) problems.push(`${label} tone ${t} letter`);
          if (mod(pitchClass(n) - expectedRoot, 12) !== iv.semis) problems.push(`${label} tone ${t} pitch`);
          if (Math.abs(n.acc) > 1) problems.push(`${label} needs ${noteName(n)}`);
        });
      }
    }
  }
  return problems;
}
