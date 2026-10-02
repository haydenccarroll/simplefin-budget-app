import React from 'react';
import { Circle, Ellipse, Path } from 'react-native-svg';

// Building blocks shared by the characters' artwork. None of this is required: an art module
// can draw everything itself. They exist so a new character only has to supply a body, a few
// accessories and a face layout (see `anchor` below) to get every mood for free.
//
// `anchor` describes where the face goes on a character, in viewBox units:
//   {
//     eyes:  { left: { x, y }, right: { x, y }, rx, ry },   // eye centres and solid-eye size
//     mouth: { x, y },                                      // centre of the mouth
//     travel: 3,                                            // how far the eyes shift to look about
//   }
// `gaze` is { x, y } in -1..1 (x positive is the way the character faces). `ink` is the
// outline colour.

const LINE = { strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' };

export function Eyes({ mood, gaze, anchor, ink }) {
    const { left, right, rx = 3.6, ry = 4.8 } = anchor.eyes;
    const dx = gaze.x * anchor.travel;
    const dy = gaze.y * anchor.travel;
    return [left, right].map((eye, i) => {
        // The right-hand eye (i = 1) mirrors the left for the shapes that are symmetrical.
        const flip = i === 0 ? -1 : 1;
        if (mood === 'tickled') {
            // scrunched with laughter: > <
            return <Path key={i} d={`M${eye.x + flip * 6} ${eye.y - 5} L${eye.x - flip * 4} ${eye.y} L${eye.x + flip * 6} ${eye.y + 5}`} stroke={ink} strokeWidth={3.2} {...LINE} />;
        }
        if (mood === 'hug') {
            // content, closed: ^ ^
            return <Path key={i} d={`M${eye.x - 6} ${eye.y + 2} Q${eye.x} ${eye.y - 6} ${eye.x + 6} ${eye.y + 2}`} stroke={ink} strokeWidth={3} {...LINE} />;
        }
        if (mood === 'sleep') {
            return <Path key={i} d={`M${eye.x - 6} ${eye.y - 1} Q${eye.x} ${eye.y + 5} ${eye.x + 6} ${eye.y - 1}`} stroke={ink} strokeWidth={2.8} {...LINE} />;
        }
        const worried = mood === 'worried';
        const cx = eye.x + dx;
        const cy = eye.y + dy;
        return (
            <React.Fragment key={i}>
                <Ellipse cx={cx} cy={cy} rx={worried ? rx * 0.85 : rx} ry={worried ? ry * 0.9 : ry} fill={ink} />
                <Circle cx={cx + 1.1} cy={cy - 1.6} r={1.1} fill="#fff" />
            </React.Fragment>
        );
    });
}

export function Brows({ mood, anchor, ink }) {
    const { left, right } = anchor.eyes;
    if (mood === 'sleep') return null;
    const common = { stroke: ink, strokeWidth: 3, ...LINE };
    if (mood === 'worried') {
        // inner ends pulled up
        return (
            <>
                <Path d={`M${left.x - 7} ${left.y - 7} L${left.x + 6} ${left.y - 14}`} {...common} />
                <Path d={`M${right.x - 6} ${right.y - 14} L${right.x + 7} ${right.y - 7}`} {...common} />
            </>
        );
    }
    const lift = mood === 'tickled' || mood === 'hug' ? 3 : 0;
    return (
        <>
            <Path d={`M${left.x - 7} ${left.y - 9 - lift} Q${left.x} ${left.y - 13 - lift} ${left.x + 7} ${left.y - 10 - lift}`} {...common} />
            {/* one brow sits a touch higher, as real ones do */}
            <Path d={`M${right.x - 7} ${right.y - 11 - lift} Q${right.x} ${right.y - 15 - lift} ${right.x + 7} ${right.y - 9 - lift}`} {...common} />
        </>
    );
}

export function Mouth({ mood, anchor, ink, inside = '#6d1c1c', tongue = '#d9686c' }) {
    const { x, y } = anchor.mouth;
    if (mood === 'tickled') {
        return (
            <>
                <Path d={`M${x - 8} ${y - 1} Q${x} ${y + 15} ${x + 8} ${y - 1} Z`} fill={inside} stroke={ink} strokeWidth={2.4} strokeLinejoin="round" />
                <Ellipse cx={x} cy={y + 7} rx={3.6} ry={2.2} fill={tongue} />
            </>
        );
    }
    if (mood === 'sleep') return <Ellipse cx={x} cy={y + 3} rx={3.2} ry={2.8} fill={inside} stroke={ink} strokeWidth={2} />;
    if (mood === 'worried') {
        return <Path d={`M${x - 7} ${y + 3} Q${x - 3.5} ${y - 2} ${x} ${y + 2} Q${x + 3.5} ${y + 6} ${x + 7} ${y + 1}`} stroke={ink} strokeWidth={2.6} {...LINE} />;
    }
    if (mood === 'hug') return <Path d={`M${x - 9} ${y - 1} Q${x} ${y + 10} ${x + 9} ${y - 1}`} stroke={ink} strokeWidth={2.6} {...LINE} />;
    return <Path d={`M${x - 7} ${y} Q${x} ${y + 6} ${x + 7} ${y - 1}`} stroke={ink} strokeWidth={2.6} {...LINE} />;
}

// A few pencil strokes on each cheek instead of round blush circles.
export function Blush({ anchor, color = '#e07a7a' }) {
    const { left, right } = anchor.eyes;
    const stroke = { stroke: color, strokeWidth: 1.8, ...LINE };
    const at = (cx) => [0, 4, 8].map((o) => <Path key={o} d={`M${cx + o - 5} ${left.y + 17} l2.6 -4`} {...stroke} />);
    return <>{at(left.x - 4)}{at(right.x - 2)}</>;
}

export function Sweat({ x, y, fill = '#8cc8f0', ink }) {
    return <Path d={`M${x} ${y} C${x - 5} ${y + 8} ${x - 5} ${y + 14} ${x} ${y + 14} C${x + 5} ${y + 14} ${x + 5} ${y + 8} ${x} ${y} Z`} fill={fill} stroke={ink} strokeWidth={2} strokeLinejoin="round" />;
}

// An arm or leg: a tube with an ink outline, drawn as two strokes of one path.
export function Limb({ d, color, ink, width = 4.5 }) {
    return (
        <>
            <Path d={d} stroke={ink} strokeWidth={width + 3.6} {...LINE} />
            <Path d={d} stroke={color} strokeWidth={width} {...LINE} />
        </>
    );
}

export function Hand({ x, y, color, ink, r = 5.2 }) {
    return <Circle cx={x} cy={y} r={r} fill={color} stroke={ink} strokeWidth={2.4} />;
}

// Little irregular bumps (warts) and hatching strokes on the shaded side, which give the
// body a drawn-by-hand texture. `bumps` is [[x, y, r], ...]; `hatch` is [[x1, y1, x2, y2], ...].
export function Texture({ bumps, hatch, dark, ink }) {
    return (
        <>
            {hatch.map(([x1, y1, x2, y2], i) => (
                <Path key={`h${i}`} d={`M${x1} ${y1} L${x2} ${y2}`} stroke={dark} strokeWidth={2} opacity={0.7} {...LINE} />
            ))}
            {bumps.map(([x, y, r], i) => (
                <React.Fragment key={`b${i}`}>
                    <Ellipse cx={x} cy={y} rx={r} ry={r * 0.82} fill={dark} />
                    <Path d={`M${x - r * 0.6} ${y + r * 0.5} Q${x} ${y + r * 1.1} ${x + r * 0.7} ${y + r * 0.4}`} stroke={ink} strokeWidth={1} opacity={0.55} {...LINE} />
                </React.Fragment>
            ))}
        </>
    );
}
