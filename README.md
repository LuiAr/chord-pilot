# Chord Pilot

Practise chord progressions through all 12 keys on a BUSY Bar, hands free. The front shows the current chord coloured by its function, the next chord and a beat bar; the back shows the chord's notes and a keyboard. Chord Pilot is silent: it shows the changes, you play them.

<img src="screenshots/front-1@8x.png" width="576" alt="Chord Pilot, the front display">
<img src="screenshots/front-2@8x.png" width="576" alt="Chord Pilot, the front display">
<img src="screenshots/back-1@8x.png" width="480" alt="Chord Pilot, the back display">

## How to use

- **Start**: Plays or pauses: one bar of count-in, then the chords change on the beat
- **Wheel turn**: Changes the key
- **Wheel press**: Steps to the next chord; hold it to change progression
- **Back**: Exits

Tempo, beats per chord and what happens after each round (up a fourth, up a semitone, or stay) are the app's settings; they apply the next time the app starts.

## Settings

Change them in the BUSY Bar's local web interface.

- **Tempo (BPM)**: Default: 80.
- **Beats per chord**: Default: 4 (one bar).
- **After each round**: Default: Move up a fourth (C, F, Bb...).

## Build and install

```sh
npm ci
npm run build         # dist/app.luiar.chord-pilot.tgz
npm run app:install   # on a BUSY Bar connected over USB
```

Or open the folder in BUSY Bar Emulator and press Refresh.

Made for [BUSY Bar](https://busy.app).
