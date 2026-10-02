import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, StyleSheet, Text, View } from 'react-native';
import Meter from './Meter';
import copy from '../../copy';
import theme from '../../theme';

const THRESHOLD = 70; // how far the content must be pulled for a release to refresh
const HOLD = 70; // where the content rests while refreshing
const MAX_PULL = 130;
const RESISTANCE = 0.55; // the content moves this fraction of what the finger moves
const MIN_REFRESH_MS = 900; // so the loading bar is seen even when the network is instant

// Pull-to-refresh with a pickle loading bar. RefreshControl can't do this: it
// has no pull distance to draw a bar with, and it doesn't exist on web.
//
// Usage: children is a function that gets props to spread onto a ScrollView:
//   <PullToRefresh onRefresh={load} onTrigger={party}>
//     {(scrollProps) => <ScrollView {...scrollProps}>...</ScrollView>}
//   </PullToRefresh>
// `onRefresh` returns a promise. `onTrigger` fires the moment a long-enough pull
// is released, before the refresh finishes.
export default function PullToRefresh({ onRefresh, onTrigger, children, style }) {
    const pull = useRef(new Animated.Value(0)).current;
    const scrollY = useRef(0);
    const distance = useRef(0);
    const busy = useRef(false);
    const mounted = useRef(true);
    const latest = useRef({});
    latest.current = { onRefresh, onTrigger };
    const [pulling, setPulling] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => () => { mounted.current = false; }, []);

    const springTo = (toValue) => Animated.spring(pull, { toValue, friction: 8, tension: 80, useNativeDriver: false }).start();

    const release = async () => {
        if (!mounted.current) return;
        setPulling(false);
        if (distance.current < THRESHOLD) {
            springTo(0);
            return;
        }
        busy.current = true;
        setRefreshing(true);
        springTo(HOLD);
        latest.current.onTrigger?.();
        try {
            await Promise.all([latest.current.onRefresh(), new Promise((resolve) => setTimeout(resolve, MIN_REFRESH_MS))]);
        } finally {
            busy.current = false;
            distance.current = 0;
            if (mounted.current) {
                setRefreshing(false);
                springTo(0);
            }
        }
    };

    // Captures a downward drag only when the list is already at the top, and
    // lets everything else (scrolling, taps) through untouched.
    const responder = useRef(PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
            !busy.current && scrollY.current <= 1 && gesture.dy > 8 && gesture.dy > Math.abs(gesture.dx) * 1.5,
        onPanResponderGrant: () => setPulling(true),
        onPanResponderMove: (_, gesture) => {
            distance.current = Math.max(0, Math.min(MAX_PULL, gesture.dy * RESISTANCE));
            pull.setValue(distance.current);
        },
        onPanResponderRelease: release,
        onPanResponderTerminate: release,
        onPanResponderTerminationRequest: () => false,
    })).current;

    const scrollProps = {
        onScroll: (event) => { scrollY.current = event.nativeEvent.contentOffset.y; },
        scrollEventThrottle: 16,
        scrollEnabled: !pulling,
        // The pull is ours; the platform's own overscroll would fight it.
        bounces: false,
        overScrollMode: 'never',
    };

    return (
        <View style={[styles.container, style]} {...responder.panHandlers}>
            <PullIndicator pull={pull} refreshing={refreshing} />
            <Animated.View style={[styles.content, { transform: [{ translateY: pull }] }]}>
                {children(scrollProps)}
            </Animated.View>
        </View>
    );
}

// Sits behind the content and is uncovered as the content is pulled down.
function PullIndicator({ pull, refreshing }) {
    const [ratio, setRatio] = useState(0);
    const sweep = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const id = pull.addListener(({ value }) => {
            if (!refreshing) setRatio(Math.min(1, value / THRESHOLD));
        });
        return () => pull.removeListener(id);
    }, [pull, refreshing]);

    // While refreshing, the bar fills over and over.
    useEffect(() => {
        if (!refreshing) return undefined;
        sweep.setValue(0);
        const id = sweep.addListener(({ value }) => setRatio(value));
        const loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: false }));
        loop.start();
        return () => {
            loop.stop();
            sweep.removeListener(id);
        };
    }, [refreshing]);

    const label = refreshing
        ? copy.pullToRefresh.refreshing
        : ratio >= 1
            ? copy.pullToRefresh.release
            : copy.pullToRefresh.pull;

    return (
        <Animated.View style={[styles.indicator, { opacity: pull.interpolate({ inputRange: [0, 20, 50], outputRange: [0, 0.6, 1], extrapolate: 'clamp' }) }]}>
            <View style={styles.bar}>
                <Meter ratio={ratio} />
            </View>
            <Text style={styles.label}>{label}</Text>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    // userSelect: dragging with a mouse on web would otherwise highlight text.
    container: { flex: 1, overflow: 'hidden', userSelect: 'none' },
    content: { flex: 1 },
    indicator: { position: 'absolute', top: 0, left: 0, right: 0, height: HOLD, alignItems: 'center', justifyContent: 'center' },
    bar: { width: 220 },
    label: { ...theme.typography.label, color: theme.colors.primaryDark, fontWeight: '800', marginTop: theme.spacing.sm },
});
