import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Pickle from './Pickle';
import { artWidth, getArt } from './art';
import theme from '../../theme';
import { nativeDriver } from '../../utils/animation';
import copy from '../../copy';
import { pick } from '../../utils/fun';
import { subscribeTouch } from '../../utils/touchBus';

const timing = (value, toValue, duration) => Animated.timing(value, { toValue, duration, useNativeDriver: nativeDriver });

// Walk over, squeeze, walk back.
export const HUG_MS = 1900;
const GAZE_HOLD_MS = 3000;
// Beyond this many pixels away the pupils are fully turned that way.
const GAZE_FULL_DISTANCE = 90;

// A Pickle that bobs on its own and can:
//  - tickle() / say(text): giggle, hop, scoot sideways (`moveDir`: 1 right, -1 left) and say
//    something silly, or the given text
//  - hug(distance): scoot `distance` px toward its friend, squeeze, then go back
//  - fall asleep after `sleepAfterMs` without any touch in the app (0 = never)
//  - look at wherever you last tapped
// `mood` is its resting expression; tickling, hugging and sleeping override it.
const PickleBuddy = forwardRef(function PickleBuddy(
    { character, height = 90, facing = 'right', mood = 'happy', moveDir = 1, bubbleAlign = 'start', tickleOnPress = false, sleepAfterMs = 0, style },
    ref
) {
    const bob = useRef(new Animated.Value(0)).current;
    const hop = useRef(new Animated.Value(0)).current;
    const slide = useRef(new Animated.Value(0)).current;
    const tilt = useRef(new Animated.Value(0)).current;
    const bubble = useRef(new Animated.Value(0)).current;
    const zzz = useRef(new Animated.Value(0)).current;
    const box = useRef(null);
    const actionTimer = useRef(null);
    const idleTimer = useRef(null);
    const gazeTimer = useRef(null);
    const [action, setAction] = useState(null);
    const [asleep, setAsleep] = useState(false);
    const [look, setLook] = useState(undefined);
    const [line, setLine] = useState('');

    const width = artWidth(character, height);
    const shownMood = action || (asleep ? 'sleep' : mood);

    // Any sign of life resets the nap timer.
    const stayAwake = () => {
        clearTimeout(idleTimer.current);
        setAsleep(false);
        if (sleepAfterMs > 0) idleTimer.current = setTimeout(() => setAsleep(true), sleepAfterMs);
    };

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                timing(bob, 1, character === 'dill' ? 1700 : 1400),
                timing(bob, 0, character === 'dill' ? 1700 : 1400),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [bob, character]);

    useEffect(() => {
        stayAwake();
        return () => {
            clearTimeout(actionTimer.current);
            clearTimeout(idleTimer.current);
            clearTimeout(gazeTimer.current);
        };
    }, [sleepAfterMs]);

    useEffect(() => subscribeTouch((pageX, pageY) => {
        stayAwake();
        box.current?.measureInWindow((x, y, w, h) => {
            const dx = pageX - (x + w / 2);
            const dy = pageY - (y + h * getArt(character).eyeLine);
            const distance = Math.hypot(dx, dy) || 1;
            const strength = Math.min(1, distance / GAZE_FULL_DISTANCE);
            setLook({ x: (dx / distance) * strength, y: (dy / distance) * strength });
            clearTimeout(gazeTimer.current);
            gazeTimer.current = setTimeout(() => setLook(undefined), GAZE_HOLD_MS);
        });
    }), [sleepAfterMs]);

    useEffect(() => {
        if (!asleep) return undefined;
        zzz.setValue(0);
        const loop = Animated.loop(timing(zzz, 1, 2200));
        loop.start();
        return () => loop.stop();
    }, [asleep]);

    const startAction = (name, duration) => {
        clearTimeout(actionTimer.current);
        stayAwake();
        setAction(name);
        actionTimer.current = setTimeout(() => setAction(null), duration);
    };

    // `text` overrides what it says; guarded because Pressable passes its press event here.
    const tickle = (text) => {
        setLine(typeof text === 'string' ? text : pick(copy.lines.tickle));
        startAction('tickled', 1300);
        hop.setValue(0);
        slide.setValue(0);
        tilt.setValue(0);
        bubble.setValue(0);

        const hops = [];
        for (let i = 0; i < 3; i++) hops.push(timing(hop, -16, 110), timing(hop, 0, 110));

        Animated.parallel([
            Animated.sequence(hops),
            Animated.sequence([timing(tilt, 1, 90), timing(tilt, -1, 90), timing(tilt, 1, 90), timing(tilt, -1, 90), timing(tilt, 0, 90)]),
            Animated.sequence([timing(slide, moveDir * 28, 240), Animated.delay(500), timing(slide, 0, 300)]),
            Animated.sequence([
                Animated.spring(bubble, { toValue: 1, friction: 5, useNativeDriver: nativeDriver }),
                Animated.delay(1000),
                timing(bubble, 0, 200),
            ]),
        ]).start();
    };

    // `distance` is how far this pickle walks; its friend walks the same distance from the other side.
    const hug = (distance) => {
        startAction('hug', HUG_MS);
        slide.setValue(0);
        Animated.sequence([
            Animated.timing(slide, { toValue: moveDir * distance, duration: 550, easing: Easing.out(Easing.back(1.4)), useNativeDriver: nativeDriver }),
            Animated.delay(HUG_MS - 550 - 350),
            timing(slide, 0, 350),
        ]).start();
    };

    useImperativeHandle(ref, () => ({ tickle, say: tickle, hug }));

    const bobY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });
    const body = (
        <Animated.View
            style={{
                transform: [
                    { translateX: slide },
                    { translateY: Animated.add(bobY, hop) },
                    { rotate: tilt.interpolate({ inputRange: [-1, 1], outputRange: ['-12deg', '12deg'] }) },
                ],
            }}
        >
            <Pickle character={character} height={height} facing={facing} mood={shownMood} look={look} />
        </Animated.View>
    );

    return (
        <View ref={box} collapsable={false} style={[{ width, height, zIndex: 2 }, style]}>
            {tickleOnPress ? <Pressable onPress={tickle} android_disableSound>{body}</Pressable> : body}
            <Animated.View
                style={[
                    styles.bubble,
                    { top: height + 2, opacity: bubble, transform: [{ scale: bubble }] },
                    bubbleAlign === 'end' ? { right: 0 } : { left: 0 },
                ]}
            >
                <Text style={styles.bubbleText}>{line}</Text>
            </Animated.View>
            {asleep && !action ? (
                <Animated.Text
                    style={[
                        styles.zzz,
                        bubbleAlign === 'end' ? { right: width * 0.55 } : { left: width * 0.55 },
                        {
                            opacity: zzz.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 1, 0] }),
                            transform: [{ translateY: zzz.interpolate({ inputRange: [0, 1], outputRange: [6, -14] }) }],
                        },
                    ]}
                >
                    {copy.lines.sleeping}
                </Animated.Text>
            ) : null}
        </View>
    );
});

export default PickleBuddy;

const styles = StyleSheet.create({
    bubble: {
        position: 'absolute',
        minWidth: 110,
        maxWidth: 170,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radii.lg,
        backgroundColor: theme.colors.surface,
        borderWidth: 2,
        borderColor: theme.colors.primary,
        pointerEvents: 'none',
    },
    bubbleText: { fontSize: 13, fontWeight: '800', color: theme.colors.primaryDark, textAlign: 'center' },
    zzz: { position: 'absolute', top: 4, fontSize: 16, fontWeight: '900', fontStyle: 'italic', color: '#3a8fd1', pointerEvents: 'none' },
});
