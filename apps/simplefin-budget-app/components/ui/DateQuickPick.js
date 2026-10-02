import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Bouncy from './Bouncy';
import copy from '../../copy';
import theme from '../../theme';
import { todayISODate, yesterdayISODate, formatDateLabel } from '../../utils/format';

// An optional date ("YYYY-MM-DD" or null) with one-tap Today / Yesterday and a
// Select Date picker. Tapping the active Today/Yesterday again clears the date.
export default function DateQuickPick({ label = copy.dateQuickPick.label, value, onChange }) {
    const inputRef = useRef(null);

    const today = todayISODate();
    const yesterday = yesterdayISODate();
    const isToday = value === today;
    const isYesterday = value === yesterday;
    const isCustom = Boolean(value) && !isToday && !isYesterday;

    const pick = (iso) => onChange(value === iso ? null : iso);

    return (
        <View style={styles.container}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.row}>
                <Pill title={copy.dateQuickPick.today} active={isToday} onPress={() => pick(today)} />
                <Pill title={copy.dateQuickPick.yesterday} active={isYesterday} onPress={() => pick(yesterday)} />
                <Pill
                    title={isCustom ? formatDateLabel(value) : copy.dateQuickPick.pickDate}
                    active={isCustom}
                    onPress={() => {
                        const input = inputRef.current;
                        if (!input) return;
                        if (input.showPicker) input.showPicker();
                        else input.click();
                    }}
                />
            </View>
            {value ? (
                <TouchableOpacity touchSoundDisabled onPress={() => onChange(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.clear}>{copy.dateQuickPick.clear}</Text>
                </TouchableOpacity>
            ) : (
                <Text style={styles.hint}>{copy.dateQuickPick.none}</Text>
            )}
            {/* The browser's own date picker, opened by the Select Date pill. */}
            <input
                ref={inputRef}
                type="date"
                value={value || today}
                onChange={(event) => event.target.value && onChange(event.target.value)}
                tabIndex={-1}
                aria-hidden="true"
                style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' }}
            />
        </View>
    );
}

function Pill({ title, active, onPress }) {
    return (
        <Bouncy style={[styles.pill, active && styles.pillActive]} onPress={onPress} scaleTo={0.94}>
            <Text style={[styles.pillText, active && styles.pillTextActive]} numberOfLines={1}>{title}</Text>
        </Bouncy>
    );
}

const styles = StyleSheet.create({
    container: { marginBottom: theme.spacing.lg },
    label: {
        ...theme.typography.label,
        color: theme.colors.textSecondary,
        marginBottom: theme.spacing.xs,
    },
    row: { flexDirection: 'row' },
    pill: {
        flex: 1,
        height: 44,
        borderRadius: theme.radii.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: theme.spacing.sm,
    },
    pillActive: {
        backgroundColor: theme.colors.primaryTint,
        borderColor: theme.colors.primary,
    },
    pillText: { ...theme.typography.subheading, color: theme.colors.textPrimary },
    pillTextActive: { color: theme.colors.primaryDark },
    hint: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: theme.spacing.xs },
    clear: { ...theme.typography.caption, color: theme.colors.primary, marginTop: theme.spacing.xs },
});
