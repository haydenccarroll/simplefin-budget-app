import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import copy from '../../copy';
import theme from '../../theme';

// The small "Profile" link in the top right, above the banner. It scrolls away with the page.
export default function ProfileLink({ onPress }) {
    return (
        <View style={styles.row}>
            <TouchableOpacity
                touchSoundDisabled
                onPress={onPress}
                hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={copy.home.profileLabel}
            >
                <Text style={styles.text}>{copy.home.profileLink}</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    row: { alignItems: 'flex-end', paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xs },
    text: { fontSize: 14, fontWeight: '800', color: theme.colors.primaryDark },
});
