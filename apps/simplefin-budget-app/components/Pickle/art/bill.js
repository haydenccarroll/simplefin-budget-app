import React from 'react';
import { Path, Circle } from 'react-native-svg';
import { Blush, Brows, Eyes, Hand, Limb, Mouth, Sweat, Texture } from './parts';

// Bill: the tall, slightly lopsided one, with a cowlick, a red bow tie and brown shoes.
// Drawn facing right. Edit the colours here, or replace this whole file (see ./index.js).

const palette = {
    ink: '#2a1a0c',
    body: '#7cae4a',
    shade: '#5b8a36',
    mustache: '#7a4a22',
    mustacheLine: '#4a2a10',
    bow: '#d9432d',
    shoe: '#6b4423',
};

const viewBox = { width: 100, height: 210 };

const BODY = 'M30 40 C28 28 40 20 51 21 C63 22 72 31 72 45 C74 62 75 80 74 100 C73 125 76 145 72 156 C68 168 54 170 46 168 C34 166 26 158 27 140 C28 118 25 96 27 76 C28 62 30 52 30 40 Z';

const anchor = {
    eyes: { left: { x: 39, y: 57 }, right: { x: 61, y: 55 }, rx: 3.6, ry: 4.8 },
    mouth: { x: 50, y: 97 },
    travel: 3,
};

const MUSTACHE = 'M50 78 C57 72 67 73 72 79 C75 83 80 82 81 76 C83 87 73 91 65 88 C59 86 55 85 50 85 C45 85 41 86 35 88 C27 91 17 87 19 76 C20 82 25 83 28 79 C33 73 43 72 50 78 Z';

// Arms by mood: [back arm, front arm], each { d: path, hand: [x, y] }.
const ARMS = {
    idle: [
        { d: 'M28 112 C20 122 18 134 19 144', hand: [19, 148] },
        { d: 'M73 112 C84 114 88 122 88 130', hand: [88, 134] },
    ],
    tickled: [
        { d: 'M28 112 C16 108 11 98 12 88', hand: [12, 84] },
        { d: 'M73 112 C86 108 90 98 88 88', hand: [88, 84] },
    ],
    // reaching toward the friend on the right
    hug: [
        { d: 'M72 124 C80 126 88 126 93 124', hand: [95, 124] },
        { d: 'M74 110 C82 110 89 111 94 110', hand: [96, 110] },
    ],
};

function Art({ mood, gaze }) {
    const c = palette;
    const arms = ARMS[mood] || ARMS.idle;
    return (
        <>
            {/* legs and shoes */}
            <Limb d="M41 166 L40 191" color={c.body} ink={c.ink} width={4} />
            <Limb d="M60 164 L61 191" color={c.body} ink={c.ink} width={4} />
            <Path d="M33 203 C31 196 36 191 42 191 C47 191 52 195 54 199 C55 202 53 204 50 204 L35 204 Z" fill={c.shoe} stroke={c.ink} strokeWidth={2.4} strokeLinejoin="round" />
            <Path d="M54 204 C52 197 57 192 63 192 C68 192 73 196 75 200 C76 203 74 205 71 205 L56 205 Z" fill={c.shoe} stroke={c.ink} strokeWidth={2.4} strokeLinejoin="round" />

            {/* the arm on the far side sits behind the body */}
            <Limb d={arms[0].d} color={c.body} ink={c.ink} width={4} />
            <Hand x={arms[0].hand[0]} y={arms[0].hand[1]} color={c.body} ink={c.ink} />

            {/* body: an offset shadow copy, then the outlined shape */}
            <Path d={BODY} transform="translate(3 3)" fill={c.shade} />
            <Path d={BODY} fill={c.body} stroke={c.ink} strokeWidth={3.2} strokeLinejoin="round" />
            <Texture
                dark={c.shade}
                ink={c.ink}
                bumps={[[36, 88, 3], [63, 73, 2.2], [33, 121, 2.7], [64, 133, 3.4], [46, 151, 2], [58, 153, 2.5], [41, 106, 1.6]]}
                hatch={[[66, 100, 70, 108], [68, 114, 71, 123], [64, 140, 67, 149], [30, 150, 33, 156]]}
            />

            <Limb d={arms[1].d} color={c.body} ink={c.ink} width={4} />
            <Hand x={arms[1].hand[0]} y={arms[1].hand[1]} color={c.body} ink={c.ink} />

            {/* face */}
            {mood === 'hug' ? <Blush anchor={anchor} /> : null}
            <Brows mood={mood} anchor={anchor} ink={c.ink} />
            <Eyes mood={mood} gaze={gaze} anchor={anchor} ink={c.ink} />
            <Mouth mood={mood} anchor={anchor} ink={c.ink} />
            {mood === 'worried' ? <Sweat x={80} y={30} ink={c.ink} /> : null}

            {/* handlebar mustache */}
            <Path d={MUSTACHE} fill={c.mustache} stroke={c.ink} strokeWidth={2.4} strokeLinejoin="round" />
            <Path d="M38 83 Q44 80 49 82 M62 83 Q56 80 51 82" stroke={c.mustacheLine} strokeWidth={1.4} strokeLinecap="round" fill="none" />

            {/* bow tie */}
            <Path d="M50 120 C44 112 36 110 33 112 C31 118 31 124 33 129 C37 129 45 127 50 120 Z" fill={c.bow} stroke={c.ink} strokeWidth={2.2} strokeLinejoin="round" />
            <Path d="M50 120 C56 112 64 110 67 113 C69 118 68 124 66 129 C62 129 55 127 50 120 Z" fill={c.bow} stroke={c.ink} strokeWidth={2.2} strokeLinejoin="round" />
            <Circle cx={50} cy={120} r={4.2} fill={c.bow} stroke={c.ink} strokeWidth={2.2} />

            {/* cowlick */}
            <Path d="M49 23 C43 13 53 10 49 2" stroke={c.ink} strokeWidth={6.5} strokeLinecap="round" fill="none" />
            <Path d="M49 23 C43 13 53 10 49 2" stroke={c.body} strokeWidth={3} strokeLinecap="round" fill="none" />
            <Path d="M56 24 C61 17 67 19 65 11" stroke={c.ink} strokeWidth={5.5} strokeLinecap="round" fill="none" />
            <Path d="M56 24 C61 17 67 19 65 11" stroke={c.body} strokeWidth={2.4} strokeLinecap="round" fill="none" />
        </>
    );
}

export default { viewBox, eyeLine: 0.27, palette, Art };
