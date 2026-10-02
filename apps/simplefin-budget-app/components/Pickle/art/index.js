import bill from './bill';
import dill from './dill';

// The artwork for each character. To swap in your own drawing of Bill or Dill, replace the
// entry here with either:
//   - a hand-written art module like ./bill.js (an SVG drawn in code), or
//   - createSvgArt({ ... }) from ./fromSvgs.js (one exported SVG per mood).
//
// An art module is an object:
//   viewBox   { width, height }  the coordinate space it is drawn in (sets the shape of the box)
//   eyeLine   0..1               how far down the picture the eyes are (for looking at taps)
//   Art       component          draws the character inside an <Svg>; gets { mood, gaze }
//     -or-
//   Standalone component         draws the whole thing itself; gets { width, height, mood }
//
// `mood` is one of MOODS. `gaze` is { x, y } in -1..1: where the eyes should point, with
// x positive toward the way the character faces. Everything else (size, flipping to face
// left, bobbing, hopping, hugging, napping) is done for you by <Pickle> and <PickleBuddy>.
export const MOODS = ['happy', 'tickled', 'worried', 'sleep', 'hug'];

export const ART = { bill, dill };

export const getArt = (character) => ART[character] || ART.bill;

// How wide a character's box is at a given height.
export const artWidth = (character, height) => {
    const { viewBox } = getArt(character);
    return (height * viewBox.width) / viewBox.height;
};
