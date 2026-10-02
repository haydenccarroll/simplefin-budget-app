import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import copy from '../../copy';
import theme from '../../theme';

// A slim bar saying entries are waiting to be sent, and/or that what's on screen is the
// last copy saved on this device because the API can't be reached.
export default function PendingNotice({ count = 0, offline = false }) {
    if (!count && !offline) return null;
    const parts = [];
    if (offline) parts.push(copy.pending.offline);
    if (count) parts.push(copy.pending.waiting(count));
    return (
        <View style={styles.bar}>
            <Text style={styles.text}>{parts.join(' ')}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    bar: {
        marginHorizontal: theme.spacing.lg,
        marginBottom: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radii.md,
        backgroundColor: theme.colors.warningTint,
    },
    text: { ...theme.typography.caption, color: theme.colors.textSecondary, textAlign: 'center' },
});
