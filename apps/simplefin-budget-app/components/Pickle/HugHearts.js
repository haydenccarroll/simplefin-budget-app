import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { nativeDriver } from '../../utils/animation';

const INK = '#2a1a0c';
const HEARTS = [
    { color: '#e8737a', left: -22, delay: 0 },
    { color: '#7cae4a', left: 0, delay: 0.2 },
    { color: '#e8737a', left: 22, delay: 0.4 },
];
const HEART_PATH = 'M12 21 C4 15 1 10 1 6.5 C1 3.5 3.5 1 6.5 1 C9 1 11 2.5 12 4.5 C13 2.5 15 1 17.5 1 C20.5 1 23 3.5 23 6.5 C23 10 20 15 12 21 Z';

// Hearts drift up from between two pickles mid-hug. Sits in the middle of its parent.
export default function HugHearts({ visible }) {
    const progress = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!visible) return undefined;
        progress.setValue(0);
        const run = Animated.timing(progress, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: nativeDriver });
        run.start();
        return () => run.stop();
    }, [visible]);

    if (!visible) return null;

    return (
        <>
            {HEARTS.map(({ color, left, delay }, i) => (
                <Animated.View
                    key={i}
                    style={[
                        styles.heart,
                        {
                            marginLeft: left,
                            opacity: progress.interpolate({ inputRange: [0, delay, delay + 0.15, 0.9, 1], outputRange: [0, 0, 1, 1, 0] }),
                            transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, -26] }) }],
                        },
                    ]}
                >
                    <Svg width={20} height={19} viewBox="0 0 24 22">
                        <Path d={HEART_PATH} fill={color} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
                    </Svg>
                </Animated.View>
            ))}
        </>
    );
}

const styles = StyleSheet.create({
    heart: { position: 'absolute', left: '50%', top: 30, pointerEvents: 'none', zIndex: 5 },
});
