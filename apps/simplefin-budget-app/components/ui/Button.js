import React from 'react';
import { Text, StyleSheet, ActivityIndicator } from 'react-native';
import Bouncy from './Bouncy';
import theme from '../../theme';

const variantStyles = {
    primary: { backgroundColor: theme.colors.primary, textColor: theme.colors.textInverse, edge: theme.colors.primaryDark },
    secondary: { backgroundColor: theme.colors.mustardTint, textColor: theme.colors.mustache, edge: theme.colors.mustard },
    danger: { backgroundColor: theme.colors.critical, textColor: theme.colors.textInverse, edge: theme.colors.criticalDark },
    ghost: { backgroundColor: 'transparent', textColor: theme.colors.primary },
};

export default function Button({ title, onPress, variant = 'primary', disabled, loading, style }) {
    const v = variantStyles[variant] || variantStyles.primary;
    return (
        <Bouncy
            style={[
                styles.base,
                { backgroundColor: v.backgroundColor },
                v.edge && { borderBottomWidth: 4, borderBottomColor: v.edge },
                variant === 'ghost' && styles.ghostBorder,
                disabled && styles.disabled,
                style,
            ]}
            onPress={onPress}
            disabled={disabled || loading}
        >
            {loading ? (
                <ActivityIndicator color={v.textColor} />
            ) : (
                <Text style={[styles.text, { color: v.textColor }]}>{title}</Text>
            )}
        </Bouncy>
    );
}

const styles = StyleSheet.create({
    base: {
        height: 50,
        borderRadius: theme.radii.md,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.lg,
    },
    ghostBorder: {
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    disabled: {
        opacity: 0.5,
    },
    text: {
        fontSize: 16,
        fontWeight: '800',
    },
});
