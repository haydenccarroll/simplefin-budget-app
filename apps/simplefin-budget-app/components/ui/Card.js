import React from 'react';
import { View, StyleSheet } from 'react-native';
import theme from '../../theme';

export default function Card({ children, style }) {
    return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.lg,
        borderWidth: 2,
        borderColor: theme.colors.border,
        ...theme.shadow.card,
    },
});
