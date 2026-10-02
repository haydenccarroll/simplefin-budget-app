import React, { useRef } from 'react';
import { Animated, Pressable } from 'react-native';
import { nativeDriver } from '../../utils/animation';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// A Pressable that squishes when pressed and boings back with an overshoot.
// Takes the same props as Pressable (style is a plain style, not a function).
// Android's press click is off by default here; pass android_disableSound={false} to get it back.
export default function Bouncy({ style, scaleTo = 0.92, onPressIn, onPressOut, android_disableSound = true, children, ...rest }) {
    const scale = useRef(new Animated.Value(1)).current;

    const springTo = (toValue, friction, tension) =>
        Animated.spring(scale, { toValue, friction, tension, useNativeDriver: nativeDriver }).start();

    return (
        <AnimatedPressable
            {...rest}
            android_disableSound={android_disableSound}
            onPressIn={(event) => {
                springTo(scaleTo, 7, 300);
                onPressIn?.(event);
            }}
            onPressOut={(event) => {
                springTo(1, 3, 180);
                onPressOut?.(event);
            }}
            style={[style, { transform: [{ scale }] }]}
        >
            {children}
        </AnimatedPressable>
    );
}
