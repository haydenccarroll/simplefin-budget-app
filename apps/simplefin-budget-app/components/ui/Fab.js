import React from 'react';
import { Text, StyleSheet } from 'react-native';
import Bouncy from './Bouncy';
import copy from '../../copy';
import theme from '../../theme';

// The round "+" button floating at the bottom right of a screen.
export default function Fab({ onPress, label = copy.home.addExpenseLabel }) {
    return (
        <Bouncy style={styles.fab} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
            <Text style={styles.text} accessible={false}>+</Text>
        </Bouncy>
    );
}

const styles = StyleSheet.create({
    fab: {
        position: 'absolute',
        right: theme.spacing.xl,
        bottom: theme.spacing.xl,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: theme.colors.primary,
        borderBottomWidth: 4,
        borderBottomColor: theme.colors.primaryDark,
        alignItems: 'center',
        justifyContent: 'center',
        ...theme.shadow.card,
    },
    text: { color: theme.colors.textInverse, fontSize: 30, lineHeight: 32, marginTop: -2 },
});
