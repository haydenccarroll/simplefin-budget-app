import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import copy from '../../copy';
import theme from '../../theme';

export default function ScreenHeader({ title, onBack, right }) {
    return (
        <View style={styles.container}>
            <View style={styles.side}>
                {onBack ? (
                    <TouchableOpacity touchSoundDisabled style={styles.backButton} onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={styles.backArrow}>{'‹'}</Text>
                    </TouchableOpacity>
                ) : null}
            </View>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <View style={[styles.side, styles.rightSide]}>{right || <Text style={styles.mascot}>{copy.app.headerMark}</Text>}</View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.lg,
        paddingBottom: theme.spacing.md,
        backgroundColor: theme.colors.background,
    },
    side: {
        width: 48,
        justifyContent: 'center',
    },
    backButton: {
        width: 48,
        height: 48,
        justifyContent: 'center',
    },
    rightSide: {
        alignItems: 'flex-end',
    },
    mascot: { fontSize: 26 },
    backArrow: {
        fontSize: 40,
        color: theme.colors.textPrimary,
        lineHeight: 44,
    },
    title: {
        flex: 1,
        textAlign: 'center',
        ...theme.typography.subheading,
        color: theme.colors.primaryDark,
    },
});

// A trashcan for the top right of a screen that can delete the thing it shows.
export function TrashButton({ onPress, disabled }) {
    return (
        <TouchableOpacity touchSoundDisabled accessibilityLabel="Delete" onPress={onPress} disabled={disabled} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.mascot}>{'🗑️'}</Text>
        </TouchableOpacity>
    );
}
