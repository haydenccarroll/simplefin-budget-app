import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import copy from '../../copy';
import theme from '../../theme';

// A section's title with its "+ Add!" link on the right.
export default function SectionHeader({ title, onAdd, addLabel }) {
    return (
        <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">{title}</Text>
            <TouchableOpacity
                touchSoundDisabled
                onPress={onAdd}
                style={styles.add}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={addLabel}
            >
                <Text style={styles.addText}>{copy.common.add}</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: theme.spacing.lg,
        marginBottom: theme.spacing.sm,
    },
    title: { ...theme.typography.heading, color: theme.colors.primaryDark },
    // At least 44 tall, the smallest comfortable thumb target.
    add: { minHeight: 44, justifyContent: 'center', paddingLeft: theme.spacing.md },
    addText: { color: theme.colors.primaryDark, fontWeight: '800' },
});
