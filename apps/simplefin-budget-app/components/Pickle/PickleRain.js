import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Pickle from './Pickle';
import { nativeDriver } from '../../utils/animation';
import theme from '../../theme';

const DURATION = 3600;
const ROWS = 9;
const PER_ROW = 4;
const APPEAR_LENGTH = 0.06; // as a share of DURATION
const FALL_LENGTH = 0.24;

// The native animation driver can't ease an interpolation, so gravity is spelled out
// as keyframes instead: how far along the fall (0 to 1) at each quarter of its time,
// following t squared so it starts slow and speeds up.
const FALL_STEPS = [0, 0.25, 0.5, 0.75, 1];
const FALL_PROGRESS = FALL_STEPS.map((t) => t * t);

// Stable pseudo-random numbers, so a given item always lands in the same spot.
const rand = (n) => {
    const x = Math.sin(n * 12.9898) * 43758.5453;
    return x - Math.floor(x);
};

function buildItems() {
    const items = [];
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < PER_ROW; col++) {
            const i = row * PER_ROW + col;
            const rowFraction = row / (ROWS - 1);
            const isPickle = i % 3 === 0;
            items.push({
                key: i,
                isPickle,
                character: i % 2 === 0 ? 'bill' : 'dill',
                emoji: i % 7 === 0 ? '🥚' : '🥒',
                size: isPickle ? 64 + rand(i + 1) * 36 : 34 + rand(i + 2) * 26,
                colFraction: (col + rand(i + 3)) / PER_ROW,
                topFraction: (row + rand(i + 4) * 0.6) / ROWS,
                rotation: (rand(i + 5) - 0.5) * 70,
                spin: (rand(i + 6) - 0.5) * 400,
                // Splat on from the top of the screen down...
                appearAt: 0.02 + rowFraction * 0.3,
                // ...then the bottom ones let go first and everything tumbles off.
                fallAt: 0.55 + (1 - rowFraction) * 0.2,
            });
        }
    }
    return items;
}

// Pickles plaster the whole screen from top to bottom, then fall away.
export default function PickleRain({ visible, onDone }) {
    const { width, height } = useWindowDimensions();
    const progress = useRef(new Animated.Value(0)).current;
    const items = useMemo(() => (visible ? buildItems() : []), [visible]);

    useEffect(() => {
        if (!visible) return undefined;
        progress.setValue(0);
        const run = Animated.timing(progress, { toValue: 1, duration: DURATION, easing: Easing.linear, useNativeDriver: nativeDriver });
        run.start(({ finished }) => {
            if (finished) onDone();
        });
        return () => run.stop();
    }, [visible]);

    if (!visible) return null;

    return (
        <View style={styles.overlay}>
            {items.map((item) => {
                const top = item.topFraction * (height - item.size);
                const fallEnd = item.fallAt + FALL_LENGTH;
                const fallDistance = height - top + 160;
                return (
                    <Animated.View
                        key={item.key}
                        style={[
                            styles.item,
                            {
                                left: item.colFraction * (width - item.size),
                                top,
                                transform: [
                                    {
                                        translateY: progress.interpolate({
                                            inputRange: [0, ...FALL_STEPS.map((t) => item.fallAt + t * FALL_LENGTH), 1],
                                            outputRange: [0, ...FALL_PROGRESS.map((f) => f * fallDistance), fallDistance],
                                        }),
                                    },
                                    {
                                        rotate: progress.interpolate({
                                            inputRange: [0, item.fallAt, fallEnd, 1],
                                            outputRange: [`${item.rotation}deg`, `${item.rotation}deg`, `${item.rotation + item.spin}deg`, `${item.rotation + item.spin}deg`],
                                        }),
                                    },
                                    {
                                        scale: progress.interpolate({
                                            inputRange: [0, item.appearAt, item.appearAt + APPEAR_LENGTH / 2, item.appearAt + APPEAR_LENGTH, 1],
                                            outputRange: [0, 0, 1.25, 1, 1],
                                        }),
                                    },
                                ],
                            },
                        ]}
                    >
                        {item.isPickle ? (
                            <Pickle character={item.character} height={item.size} mood={item.key % 2 === 0 ? 'tickled' : 'happy'} />
                        ) : (
                            <Text style={{ fontSize: item.size }}>{item.emoji}</Text>
                        )}
                    </Animated.View>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: { ...theme.absoluteFill, zIndex: 90, elevation: 90, pointerEvents: 'none' },
    item: { position: 'absolute' },
});
