import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import theme from '../../theme';

// A dropdown that looks like the app's text boxes (same height, border and type size) and opens
// a list of large tappable rows, instead of the browser's tiny native <select>.
// `options` is [{ value, label }]; `value` is the selected option's value.
export default function SelectField({ label, value, options, onChange, style }) {
    const [open, setOpen] = useState(false);
    const selected = options.find((opt) => opt.value === value);

    const choose = (next) => {
        setOpen(false);
        onChange(next);
    };

    return (
        <View style={[styles.container, style]}>
            {label ? <Text style={styles.label}>{label}</Text> : null}
            <TouchableOpacity touchSoundDisabled style={styles.field} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={label}>
                <Text style={styles.value} numberOfLines={1}>{selected ? selected.label : ''}</Text>
                <Text style={styles.chevron}>{'▾'}</Text>
            </TouchableOpacity>
            <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
                <TouchableOpacity activeOpacity={1} style={styles.backdrop} onPress={() => setOpen(false)}>
                    <View style={styles.sheet} onStartShouldSetResponder={() => true}>
                        {label ? <Text style={styles.sheetTitle}>{label}</Text> : null}
                        <ScrollView keyboardShouldPersistTaps="handled">
                            {options.map((opt) => {
                                const active = opt.value === value;
                                return (
                                    <TouchableOpacity touchSoundDisabled key={String(opt.value)} style={[styles.option, active && styles.optionActive]} onPress={() => choose(opt.value)}>
                                        <Text style={[styles.optionText, active && styles.optionTextActive]} numberOfLines={2}>{opt.label}</Text>
                                        {active ? <Text style={styles.check}>{'✓'}</Text> : null}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { marginBottom: theme.spacing.lg },
    label: { ...theme.typography.label, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs },
    field: {
        height: 50,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: theme.radii.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: theme.spacing.md,
    },
    value: { flex: 1, fontSize: 16, color: theme.colors.textPrimary },
    chevron: { fontSize: 16, color: theme.colors.textSecondary, marginLeft: theme.spacing.sm },
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(11, 11, 11, 0.55)',
        justifyContent: 'center',
        padding: theme.spacing.xl,
    },
    sheet: {
        maxHeight: '70%',
        width: '100%',
        maxWidth: 420,
        alignSelf: 'center',
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        borderWidth: 3,
        borderColor: theme.colors.mustard,
        padding: theme.spacing.md,
    },
    sheetTitle: { ...theme.typography.heading, color: theme.colors.mustache, textAlign: 'center', marginBottom: theme.spacing.sm },
    option: {
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: theme.radii.md,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
    },
    optionActive: { backgroundColor: theme.colors.background },
    optionText: { flex: 1, fontSize: 16, color: theme.colors.textPrimary },
    optionTextActive: { fontWeight: '800' },
    check: { fontSize: 18, color: theme.colors.primaryDark, marginLeft: theme.spacing.sm },
});
