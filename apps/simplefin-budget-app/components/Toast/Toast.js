import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../../theme';
import { nativeDriver } from '../../utils/animation';

const ICONS = { error: '😢', success: '🤠' };

const ToastContext = createContext(() => {});

// Shows a message at the top of whatever screen is up, below the notch. Call
// `const showToast = useToast()` then `showToast('Saved!', 'success')` (type defaults to 'error').
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
    const [toast, setToast] = useState({ message: '', type: 'error', id: 0 });
    const showToast = useCallback((message, type = 'error') => {
        setToast((t) => ({ message, type, id: t.id + 1 }));
    }, []);

    return (
        <ToastContext.Provider value={showToast}>
            {children}
            <ToastView toast={toast} />
        </ToastContext.Provider>
    );
}

function ToastView({ toast }) {
    const insets = useSafeAreaInsets();
    const [visible, setVisible] = useState(false);
    const opacity = useRef(new Animated.Value(0)).current;
    const drop = useRef(new Animated.Value(-24)).current;

    // Each new message restarts the animation, so a second toast never inherits the first's timer.
    useEffect(() => {
        if (!toast.id) return undefined;
        setVisible(true);
        opacity.setValue(0);
        drop.setValue(-24);
        const animation = Animated.sequence([
            Animated.parallel([
                Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: nativeDriver }),
                Animated.spring(drop, { toValue: 0, friction: 5, useNativeDriver: nativeDriver }),
            ]),
            Animated.delay(3000),
            Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: nativeDriver }),
        ]);
        animation.start(({ finished }) => { if (finished) setVisible(false); });
        return () => animation.stop();
    }, [toast.id]);

    if (!visible) return null;

    return (
        <Animated.View
            pointerEvents="none"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[styles.container, styles[toast.type], { top: insets.top + theme.spacing.sm, opacity, transform: [{ translateY: drop }] }]}
        >
            <Text style={styles.icon} accessible={false}>{ICONS[toast.type]}</Text>
            <Text style={styles.text}>{toast.message}</Text>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: theme.spacing.xl,
        right: theme.spacing.xl,
        flexDirection: 'row',
        alignItems: 'center',
        padding: theme.spacing.lg,
        borderRadius: theme.radii.lg,
        borderBottomWidth: 4,
        zIndex: 1000,
        elevation: 1000,
    },
    error: {
        backgroundColor: theme.colors.critical,
        borderBottomColor: theme.colors.criticalDark,
    },
    success: {
        backgroundColor: theme.colors.primaryDark,
        borderBottomColor: theme.colors.primaryDeep,
    },
    icon: {
        fontSize: 22,
        marginRight: theme.spacing.md,
    },
    text: {
        flex: 1,
        color: theme.colors.textInverse,
        fontSize: 14,
        fontWeight: '700',
    },
});
