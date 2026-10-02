import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import theme from '../../theme';

export default function StatTile({ label, value, tone = 'default', align = 'flex-start' }) {
    const valueColor = tone === 'critical' ? theme.colors.critical
        : tone === 'good' ? theme.colors.primary
        : theme.colors.textPrimary;
    return (
        <View style={{ alignItems: align }}>
            <Text style={styles.label}>{label}</Text>
            <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    label: {
        ...theme.typography.label,
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        marginBottom: theme.spacing.xs,
    },
    value: {
        ...theme.typography.heading,
    },
});
