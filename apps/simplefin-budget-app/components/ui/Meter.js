import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import theme from '../../theme';

const TRACK = theme.colors.primaryTint;
const TRACK_EDGE = '#8fc97a';
const EMPTY_FILL = '#8fd16b';
const FULL_FILL = theme.colors.primaryDark;
const FULL_EDGE = '#055405';
const OVER_FILL = theme.colors.critical;
const OVER_EDGE = '#a82c2c';
const BUMP_SPACING = 16;

const lerp = (a, b, t) => Math.round(a + (b - a) * t);

// Blend two "#rrggbb" colors; t is 0..1.
function mix(from, to, t) {
    const a = from.match(/\w\w/g).map((h) => parseInt(h, 16));
    const b = to.match(/\w\w/g).map((h) => parseInt(h, 16));
    return `rgb(${lerp(a[0], b[0], t)}, ${lerp(a[1], b[1], t)}, ${lerp(a[2], b[2], t)})`;
}

// A sideways pickle that fills up as the category is spent: empty is a pale
// green pickle, and the fill deepens to dark green as it nears 100%. Maxed out
// is solid dark green; over budget turns the whole thing red.
export default function Meter({ ratio = 0, height = 24 }) {
    const [width, setWidth] = useState(0);
    const over = ratio > 1;
    const clamped = Math.max(0, Math.min(ratio, 1));
    const fill = over ? OVER_FILL : mix(EMPTY_FILL, FULL_FILL, clamped);
    const edge = over ? OVER_EDGE : mix(TRACK_EDGE, FULL_EDGE, clamped);

    const inner = height - 4;
    const radius = inner / 2;
    const trackWidth = Math.max(0, width - 4);
    // Even a sliver of spending shows as a rounded blob rather than a stray line.
    const fillWidth = clamped === 0 ? 0 : Math.max(inner, trackWidth * clamped);

    const bumps = [];
    for (let x = BUMP_SPACING / 2 + radius / 2, i = 0; x < width - radius; x += BUMP_SPACING, i++) {
        bumps.push({ x, y: height / 2 + (i % 2 === 0 ? -inner * 0.17 : inner * 0.2) });
    }

    return (
        <View style={{ width: '100%', height }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
            {width > 0 ? (
                <Svg width={width} height={height}>
                    <Rect x={2} y={2} width={trackWidth} height={inner} rx={radius} fill={TRACK} stroke={TRACK_EDGE} strokeWidth={2} />
                    {bumps.map(({ x, y }) => (
                        <Circle key={x} cx={x} cy={y} r={1.6} fill={TRACK_EDGE} opacity={0.5} />
                    ))}
                    {fillWidth > 0 ? (
                        <>
                            <Rect x={2} y={2} width={fillWidth} height={inner} rx={radius} fill={fill} stroke={edge} strokeWidth={2} />
                            <Rect x={2 + radius} y={height * 0.24} width={Math.max(0, fillWidth - radius * 2)} height={height * 0.14} rx={height * 0.07} fill="#fff" opacity={0.3} />
                            {bumps.filter(({ x }) => x < 2 + fillWidth - radius / 2).map(({ x, y }) => (
                                <Circle key={x} cx={x} cy={y} r={1.8} fill={edge} opacity={0.6} />
                            ))}
                        </>
                    ) : null}
                </Svg>
            ) : null}
        </View>
    );
}
