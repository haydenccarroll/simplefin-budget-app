import React from 'react';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

const INK = '#2a1a0c';
const RULE = '#d8d2b0';

// A page of ledger paper, scribbled on: a few labelled lines with amounts, a total
// underlined twice, and an egg doodled in the corner. Squiggles stand in for handwriting.
const ROWS = [38, 58, 78, 98];
const scribble = (x, y, w, seed) => {
    const step = w / 4;
    return `M${x} ${y} q${step / 2} ${seed % 2 ? -5 : 4} ${step} 0 t${step} ${seed % 3 ? 1 : -1} t${step} -1 t${step} 1`;
};

export default function BudgetSheet({ width = 100 }) {
    const height = (width * 150) / 120;
    return (
        <Svg width={width} height={height} viewBox="0 0 120 150">
            <Rect x={6} y={8} width={110} height={138} rx={5} fill="#d9d3b4" />
            <Rect x={4} y={4} width={110} height={138} rx={5} fill="#fffdf2" stroke={INK} strokeWidth={3} />

            {/* binding holes */}
            {[18, 38, 58, 78, 98].map((x) => (
                <Circle key={x} cx={x} cy={13} r={3} fill="#fbf9ea" stroke={INK} strokeWidth={1.8} />
            ))}

            {ROWS.map((y, i) => (
                <React.Fragment key={y}>
                    <Path d={`M12 ${y + 8} L108 ${y + 8}`} stroke={RULE} strokeWidth={1.5} strokeLinecap="round" />
                    <Path d={scribble(14, y, 44 - i * 4, i)} stroke={INK} strokeWidth={2} strokeLinecap="round" fill="none" />
                    <Path d={scribble(80, y, 26, i + 1)} stroke={INK} strokeWidth={2} strokeLinecap="round" fill="none" />
                </React.Fragment>
            ))}
            {/* one line ticked off */}
            <Path d="M64 76 L68 81 L76 69" stroke="#5b8a36" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />

            {/* total, underlined twice */}
            <Path d={scribble(80, 122, 26, 2)} stroke={INK} strokeWidth={2.6} strokeLinecap="round" fill="none" />
            <Path d="M78 129 L108 129 M79 133 L108 132" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />

            {/* egg doodle */}
            <Path d="M14 128 C10 120 20 113 29 117 C36 112 45 120 41 127 C46 134 36 140 27 136 C19 141 10 135 14 128 Z" fill="#fff" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
            <Ellipse cx={27} cy={126} rx={6} ry={5.5} fill="#f2b632" stroke={INK} strokeWidth={1.4} />
        </Svg>
    );
}
