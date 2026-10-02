import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { nativeDriver } from '../../utils/animation';

const SLIDE_DISTANCE = 56;
const SLIDE_MS = 240;

// Turns the page when animKey changes: the new content slides in from the side it came
// from (direction 1 = from the right, as when going forward) while fading in.
export default function SlideIn({ animKey, direction = 1, style, children }) {
    const x = useRef(new Animated.Value(0)).current;
    const opacity = useRef(new Animated.Value(1)).current;
    const first = useRef(true);

    useEffect(() => {
        if (first.current) {
            first.current = false;
            return;
        }
        x.setValue(direction * SLIDE_DISTANCE);
        opacity.setValue(0);
        Animated.parallel([
            Animated.timing(x, { toValue: 0, duration: SLIDE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: nativeDriver }),
            Animated.timing(opacity, { toValue: 1, duration: SLIDE_MS, easing: Easing.out(Easing.quad), useNativeDriver: nativeDriver }),
        ]).start();
        // direction is only read when the key changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [animKey]);

    return (
        <Animated.View style={[{ flex: 1 }, style, { opacity, transform: [{ translateX: x }] }]}>
            {children}
        </Animated.View>
    );
}
