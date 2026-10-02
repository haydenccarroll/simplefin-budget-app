import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import theme from '../../theme';

export default function EmptyState({ title, subtitle, emoji }) {
    return (
        <View style={styles.container}>
            {emoji ? <Text style={styles.emoji}>{emoji}</Text> : null}
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingVertical: theme.spacing.xxl,
        alignItems: 'center',
    },
    emoji: { fontSize: 36, marginBottom: theme.spacing.sm },
    title: {
        ...theme.typography.subheading,
        textAlign: 'center',
        color: theme.colors.textSecondary,
        marginBottom: theme.spacing.xs,
    },
    subtitle: {
        ...theme.typography.body,
        color: theme.colors.textMuted,
        textAlign: 'center',
        paddingHorizontal: theme.spacing.xl,
    },
});
