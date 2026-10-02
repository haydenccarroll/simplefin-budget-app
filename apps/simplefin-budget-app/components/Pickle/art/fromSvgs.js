import React from 'react';
import { SvgXml } from 'react-native-svg';

// The no-code way to give a character your own artwork: export one SVG per mood from your
// drawing app and hand the SVG text to this. Moods you leave out fall back to `happy`.
//
//   import { createSvgArt } from './fromSvgs';
//   export default createSvgArt({
//       viewBox: { width: 100, height: 210 },   // the size your SVGs were drawn at
//       eyeLine: 0.27,                           // how far down the eyes are (0..1), for looking at taps
//       moods: { happy: '<svg ...>', tickled: '<svg ...>', worried: '<svg ...>', sleep: '<svg ...>', hug: '<svg ...>' },
//   });
//
// Draw the character facing right; the app flips it for the other side. Pictures like this
// don't follow taps with their eyes (there's no separate pupil to move), but everything else
// (bobbing, hopping, hugging, napping, speech bubbles) works as it does for the built-in ones.
export function createSvgArt({ viewBox, eyeLine = 0.27, moods }) {
    function Standalone({ width, height, mood }) {
        return <SvgXml xml={moods[mood] || moods.happy} width={width} height={height} />;
    }
    return { viewBox, eyeLine, Standalone };
}
