import React from 'react';
import { View } from 'react-native';
import Svg from 'react-native-svg';
import { artWidth, getArt } from './art';

// One character, drawn by its art module (see ./art/index.js) at the given height.
// All artwork is drawn facing right; `facing="left"` mirrors it so a pair can stand nose to nose.
//
// mood: 'happy' | 'tickled' | 'worried' | 'sleep' | 'hug'
// look: where the eyes point, x and y in -1..1 in screen terms (x positive is screen
//       right). Defaults to gazing a little toward the way they face.
const DEFAULT_LOOK = { x: 0.75, y: 0.15 };

export default function Pickle({ character = 'bill', height = 100, facing = 'right', mood = 'happy', look = DEFAULT_LOOK }) {
    const art = getArt(character);
    const width = artWidth(character, height);
    // The artwork is mirrored for left-facing pickles, so undo that for the gaze.
    const gaze = { x: facing === 'left' ? -look.x : look.x, y: look.y };

    return (
        <View style={{ width, height, transform: [{ scaleX: facing === 'left' ? -1 : 1 }] }}>
            {art.Standalone ? (
                <art.Standalone width={width} height={height} mood={mood} gaze={gaze} />
            ) : (
                <Svg width={width} height={height} viewBox={`0 0 ${art.viewBox.width} ${art.viewBox.height}`}>
                    <art.Art mood={mood} gaze={gaze} />
                </Svg>
            )}
        </View>
    );
}
