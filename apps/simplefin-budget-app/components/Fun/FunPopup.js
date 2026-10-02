import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Pickle from '../Pickle/Pickle';
import theme from '../../theme';
import { nativeDriver } from '../../utils/animation';
import { subscribeFunPopup } from '../../utils/fun';

// Lives at the app root so a form can fire a popup and navigate back in the same
// breath; it floats over whatever screen shows up next, then fades on its own.
export default function FunPopupHost() {
    const [popup, setPopup] = useState(null);
    const scale = useRef(new Animated.Value(0)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    const run = useRef(null);

    useEffect(() => subscribeFunPopup((next) => {
        run.current?.stop();
        setPopup(next);
        scale.setValue(0.5);
        opacity.setValue(0);
        run.current = Animated.sequence([
            Animated.parallel([
                Animated.spring(scale, { toValue: 1, friction: 4, tension: 120, useNativeDriver: nativeDriver }),
                Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: nativeDriver }),
            ]),
            Animated.delay(1800),
            Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: nativeDriver }),
        ]);
        run.current.start(({ finished }) => {
            if (finished) setPopup(null);
        });
    }), []);

    if (!popup) return null;

    const oops = popup.tone === 'oops';
    return (
        <View style={styles.overlay}>
            <Animated.View style={[styles.card, oops ? styles.cardOops : styles.cardGood, { opacity, transform: [{ scale }] }]}>
                <Pickle character={popup.character} height={64} mood={popup.mood} />
                <View style={styles.text}>
                    <Text style={[styles.title, oops && styles.titleOops]}>{popup.title}</Text>
                    <Text style={styles.subtitle}>{popup.subtitle}</Text>
                </View>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...theme.absoluteFill,
        zIndex: 1000,
        elevation: 1000,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.xl,
        pointerEvents: 'none',
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        borderRadius: theme.radii.lg,
        borderWidth: 3,
        maxWidth: 420,
        ...theme.shadow.card,
        shadowOpacity: 0.2,
    },
    cardGood: { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary },
    cardOops: { backgroundColor: theme.colors.mustardTint, borderColor: theme.colors.mustard },
    text: { flexShrink: 1, marginLeft: theme.spacing.md },
    title: { fontSize: 20, fontWeight: '900', color: theme.colors.primaryDark },
    titleOops: { color: theme.colors.mustache },
    subtitle: { fontSize: 14, fontWeight: '600', color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
});
