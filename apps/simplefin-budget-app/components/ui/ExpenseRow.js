import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, PanResponder } from 'react-native';
import { hapticSelect } from '../../utils/haptics';
import copy from '../../copy';
import theme from '../../theme';
import { formatCurrency, formatDateLabel, formatSource } from '../../utils/format';

// One expense in a list: what it was, when and who from, which jar it's in, and the amount.
// Rows waiting to sync (item.pending) can't be opened. `style` positions the row (a card on
// its own, or a divider line inside a section card).
// With `onDelete`, dragging the row left reveals a Delete button behind it (rows waiting to sync
// can't be deleted).
export default function ExpenseRow({ item, onPress, style, onDelete }) {
    const swipeable = Boolean(onDelete) && !item.pending;
    const row = (
        <TouchableOpacity
            touchSoundDisabled
            style={[styles.row, !swipeable && style]}
            disabled={item.pending}
            onPress={onPress}
            accessibilityRole="button"
        >
            <View style={styles.text}>
                <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                    {[formatDateLabel(item.transacted_at) || copy.common.mysteryDate, formatSource(item)].filter(Boolean).join(' · ')}
                </Text>
                <View style={styles.categoryRow}>
                    <Text style={[styles.category, !item.category_name && styles.categoryNone]} numberOfLines={1}>
                        {item.category_name || copy.common.notInJar}
                    </Text>
                    {item.pending ? <Badge title={copy.common.waitingToSync} /> : null}
                    {item.auto_categorized ? <Badge title={copy.common.autoJarred} /> : null}
                </View>
            </View>
            <Text style={styles.amount}>{formatCurrency(item.amount)}</Text>
        </TouchableOpacity>
    );
    if (!swipeable) return row;
    return <SwipeToDelete label={copy.expenses.deleteLabel(item.description)} onDelete={() => onDelete(item)} style={style}>{row}</SwipeToDelete>;
}

const ACTION_WIDTH = 88;
const OPEN_AT = ACTION_WIDTH / 2;

// Wraps a row so a leftward drag slides it aside to show a Delete button. Only a clearly
// horizontal drag is taken, so vertical scrolling of the list is left alone. Tapping the open
// row closes it again.
function SwipeToDelete({ children, onDelete, label, style }) {
    const x = useRef(new Animated.Value(0)).current;
    const offset = useRef(0);
    const [open, setOpen] = useState(false);

    const settle = (toValue) => {
        offset.current = toValue;
        setOpen(toValue !== 0);
        Animated.spring(x, { toValue, friction: 9, tension: 90, useNativeDriver: false }).start();
    };

    const responder = useRef(PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, g) => {
            x.setValue(Math.max(-ACTION_WIDTH * 1.4, Math.min(0, offset.current + g.dx)));
        },
        onPanResponderRelease: (_, g) => {
            const position = offset.current + g.dx;
            const shouldOpen = position < -OPEN_AT && (g.vx < 0.5 || offset.current === 0);
            if (shouldOpen && offset.current === 0) hapticSelect();
            settle(shouldOpen ? -ACTION_WIDTH : 0);
        },
        onPanResponderTerminate: () => settle(0),
    })).current;

    return (
        <View style={[style, styles.swipeWrap]}>
            <View style={styles.action}>
                <TouchableOpacity
                    touchSoundDisabled
                    style={styles.actionButton}
                    onPress={onDelete}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                >
                    <Text style={styles.actionText}>{copy.expenses.delete}</Text>
                </TouchableOpacity>
            </View>
            <Animated.View
                style={[styles.slider, { transform: [{ translateX: x }] }]}
                {...responder.panHandlers}
            >
                {children}
                {open ? <TouchableOpacity touchSoundDisabled style={StyleSheet.absoluteFill} onPress={() => settle(0)} accessibilityLabel="Close" /> : null}
            </Animated.View>
        </View>
    );
}

function Badge({ title }) {
    return (
        <View style={styles.badge}>
            <Text style={styles.badgeText}>{title}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    // The card styling goes on this wrapper, which clips the sliding row and the button behind it.
    swipeWrap: { overflow: 'hidden' },
    // touchAction: without it the browser takes a sideways drag as a pan and cancels the touch.
    slider: { backgroundColor: theme.colors.surface, touchAction: 'pan-y' },
    action: { position: 'absolute', top: 0, bottom: 0, right: 0, width: ACTION_WIDTH },
    actionButton: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.critical },
    actionText: { color: theme.colors.textInverse, fontWeight: '900', fontSize: 15 },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
    },
    // The text takes the leftover width and truncates, so the amount is never pushed off screen.
    text: { flex: 1, marginRight: theme.spacing.md },
    description: { ...theme.typography.body, color: theme.colors.textPrimary },
    meta: { color: theme.colors.textMuted, fontSize: 12, marginTop: 2 },
    categoryRow: { flexDirection: 'row', alignItems: 'center', marginTop: theme.spacing.xs },
    category: { ...theme.typography.label, color: theme.colors.textSecondary, flexShrink: 1 },
    categoryNone: { color: theme.colors.textMuted, fontWeight: '400' },
    // Marks an entry that isn't settled yet: waiting to sync, or a category the model chose that nobody has confirmed.
    badge: {
        marginLeft: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 1,
        borderRadius: theme.radii.pill,
        backgroundColor: theme.colors.warningTint,
    },
    badgeText: { fontSize: 11, fontWeight: '700', color: theme.colors.textSecondary },
    amount: { ...theme.typography.subheading, color: theme.colors.textPrimary, flexShrink: 0 },
});
