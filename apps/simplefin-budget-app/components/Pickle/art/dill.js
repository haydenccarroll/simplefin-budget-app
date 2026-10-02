import React from 'react';
import { Path, Circle, Ellipse, G } from 'react-native-svg';
import { Blush, Brows, Eyes, Hand, Limb, Mouth, Sweat, Texture } from './parts';

// Dill: the shorter, rounder one, in a bowler hat, round spectacles and a mustard waistcoat.
// Drawn facing right. Edit the colours here, or replace this whole file (see ./index.js).

const palette = {
    ink: '#2a1a0c',
    body: '#62a057',
    shade: '#40793d',
    mustache: '#7a4a22',
    mustacheLine: '#4a2a10',
    hat: '#34291f',
    band: '#e3a92b',
    vest: '#e3a92b',
    shoe: '#27211b',
};

const viewBox = { width: 100, height: 210 };

const BODY = 'M26 58 C24 44 36 36 50 36 C66 36 78 46 77 62 C80 84 83 112 80 134 C78 154 66 168 50 168 C34 168 21 156 20 136 C19 112 23 84 26 58 Z';

const anchor = {
    eyes: { left: { x: 38, y: 66 }, right: { x: 62, y: 65 }, rx: 3.3, ry: 4.4 },
    mouth: { x: 50, y: 103 },
    // the eyes sit inside spectacles, so they don't roam far
    travel: 2.2,
};

const MUSTACHE = 'M50 85 C56 81 63 82 67 86 C70 89 75 87 77 79 C79 89 73 95 66 93 C60 91 55 90 50 90 C45 90 40 91 34 93 C27 95 21 89 23 79 C25 87 30 89 33 86 C37 82 44 81 50 85 Z';

const ARMS = {
    idle: [
        { d: 'M23 114 C14 122 12 134 14 144', hand: [14, 148] },
        { d: 'M77 114 C87 116 91 124 90 132', hand: [90, 136] },
    ],
    tickled: [
        { d: 'M23 114 C11 110 7 100 9 90', hand: [9, 86] },
        { d: 'M77 114 C89 110 93 100 91 90', hand: [91, 86] },
    ],
    hug: [
        { d: 'M76 128 C83 130 89 130 93 128', hand: [95, 128] },
        { d: 'M77 114 C84 114 90 115 94 114', hand: [96, 114] },
    ],
};

function Art({ mood, gaze }) {
    const c = palette;
    const arms = ARMS[mood] || ARMS.idle;
    return (
        <>
            {/* stubby legs and boots */}
            <Limb d="M40 166 L39 190" color={c.body} ink={c.ink} width={4.5} />
            <Limb d="M61 166 L62 190" color={c.body} ink={c.ink} width={4.5} />
            <Path d="M31 204 C29 195 34 190 41 190 C48 190 54 194 55 199 C56 202 54 204 51 204 Z" fill={c.shoe} stroke={c.ink} strokeWidth={2.4} strokeLinejoin="round" />
            <Path d="M55 204 C53 195 58 190 65 190 C72 190 78 194 79 199 C80 202 78 204 75 204 Z" fill={c.shoe} stroke={c.ink} strokeWidth={2.4} strokeLinejoin="round" />

            <Limb d={arms[0].d} color={c.body} ink={c.ink} width={4.5} />
            <Hand x={arms[0].hand[0]} y={arms[0].hand[1]} color={c.body} ink={c.ink} />

            <Path d={BODY} transform="translate(3 3)" fill={c.shade} />
            <Path d={BODY} fill={c.body} stroke={c.ink} strokeWidth={3.2} strokeLinejoin="round" />
            <Texture
                dark={c.shade}
                ink={c.ink}
                bumps={[[32, 92, 2.6], [67, 78, 3], [30, 126, 3.2], [70, 128, 2.2], [42, 158, 2.6], [60, 160, 2], [72, 104, 1.8]]}
                hatch={[[71, 96, 75, 104], [73, 112, 76, 122], [68, 142, 71, 152], [27, 148, 30, 155]]}
            />

            {/* waistcoat: a V-neck with a centre seam and two buttons */}
            <Path d="M29 114 L43 114 L50 132 L57 114 L71 114 C74 130 73 146 68 154 C60 160 40 160 32 154 C27 146 26 130 29 114 Z" fill={c.vest} stroke={c.ink} strokeWidth={2.2} strokeLinejoin="round" />
            <Path d="M50 132 L50 158" stroke={c.ink} strokeWidth={1.6} strokeLinecap="round" fill="none" />
            <Circle cx={46} cy={142} r={1.8} fill={c.ink} />
            <Circle cx={46} cy={151} r={1.8} fill={c.ink} />

            <Limb d={arms[1].d} color={c.body} ink={c.ink} width={4.5} />
            <Hand x={arms[1].hand[0]} y={arms[1].hand[1]} color={c.body} ink={c.ink} />

            {/* face, behind the spectacles */}
            {mood === 'hug' ? <Blush anchor={anchor} /> : null}
            <Brows mood={mood} anchor={anchor} ink={c.ink} />
            <Eyes mood={mood} gaze={gaze} anchor={anchor} ink={c.ink} />
            <Circle cx={38} cy={66} r={9.5} fill="#fff" opacity={0.28} stroke={c.ink} strokeWidth={2} />
            <Circle cx={62} cy={65} r={9.5} fill="#fff" opacity={0.28} stroke={c.ink} strokeWidth={2} />
            <Path d="M47 64 Q50 61 53 63" stroke={c.ink} strokeWidth={2} strokeLinecap="round" fill="none" />
            <Mouth mood={mood} anchor={anchor} ink={c.ink} />
            {mood === 'worried' ? <Sweat x={82} y={44} ink={c.ink} /> : null}

            <Path d={MUSTACHE} fill={c.mustache} stroke={c.ink} strokeWidth={2.4} strokeLinejoin="round" />
            <Path d="M39 90 Q44 87 49 89 M61 90 Q56 87 51 89" stroke={c.mustacheLine} strokeWidth={1.4} strokeLinecap="round" fill="none" />

            {/* bowler hat, a little crooked */}
            <G transform="rotate(-5 50 38)">
                <Ellipse cx={50} cy={38} rx={31} ry={6.5} fill={c.hat} stroke={c.ink} strokeWidth={2.4} />
                <Path d="M33 37 C31 6 69 6 67 37 Z" fill={c.hat} stroke={c.ink} strokeWidth={2.4} strokeLinejoin="round" />
                <Path d="M33.5 29 C42 33 58 33 66.5 29 L66.8 34 C58 38 42 38 33.2 34 Z" fill={c.band} stroke={c.ink} strokeWidth={1.6} strokeLinejoin="round" />
            </G>
        </>
    );
}

export default { viewBox, eyeLine: 0.32, palette, Art };
