import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import copy from '../../copy';
import theme from '../../theme';

const TextField = React.forwardRef(function TextField({ label, error, style, ...inputProps }, ref) {
    return (
        <View style={[styles.container, style]}>
            {label ? <Text style={styles.label}>{label}</Text> : null}
            <TextInput
                ref={ref}
                style={[styles.input, error && styles.inputError]}
                placeholderTextColor={theme.colors.textMuted}
                {...inputProps}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
    );
});

export default TextField;

export function AmountField({ label, error, value, onChangeValue, style }) {
    return (
        <View style={[styles.container, style]}>
            {label ? <Text style={styles.label}>{label}</Text> : null}
            <View style={[styles.amountWrap, error && styles.inputError]}>
                <Text style={styles.amountPrefix}>$</Text>
                <TextInput
                    style={styles.amountInput}
                    keyboardType="decimal-pad"
                    placeholder={copy.common.amountPlaceholder}
                    placeholderTextColor={theme.colors.textMuted}
                    value={value}
                    onChangeText={onChangeValue}
                />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: theme.spacing.lg,
    },
    label: {
        ...theme.typography.label,
        color: theme.colors.textSecondary,
        marginBottom: theme.spacing.xs,
    },
    input: {
        height: 50,
        borderRadius: theme.radii.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: theme.spacing.md,
        fontSize: 16,
        color: theme.colors.textPrimary,
    },
    inputError: {
        borderColor: theme.colors.critical,
    },
    error: {
        color: theme.colors.critical,
        fontSize: 12,
        marginTop: theme.spacing.xs,
    },
    amountWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 50,
        borderRadius: theme.radii.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: theme.spacing.md,
    },
    amountPrefix: {
        fontSize: 16,
        color: theme.colors.textSecondary,
        marginRight: theme.spacing.xs,
    },
    amountInput: {
        flex: 1,
        fontSize: 16,
        color: theme.colors.textPrimary,
        height: '100%',
    },
});
