import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import PickleBuddy from './PickleBuddy';
import BudgetSheet from './BudgetSheet';
import copy from '../../copy';
import theme from '../../theme';

// Bill and Dill face each other over a budget. Poke either of them.
export default function PickleHero({ size = 'large' }) {
    const large = size === 'large';
    return (
        <View style={styles.container}>
            <View style={styles.row}>
                <PickleBuddy character="bill" height={large ? 165 : 92} facing="right" moveDir={1} tickleOnPress />
                <View style={large ? styles.sheetLarge : styles.sheetSmall}>
                    <BudgetSheet width={large ? 100 : 60} />
                </View>
                <PickleBuddy character="dill" height={large ? 165 : 92} facing="left" moveDir={-1} bubbleAlign="end" tickleOnPress />
            </View>
            <Text style={[styles.owners, !large && styles.ownersSmall]}>{copy.app.owners}</Text>
            <Text style={[styles.name, !large && styles.nameSmall]}>{copy.app.name}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { alignItems: 'center', marginBottom: theme.spacing.lg },
    row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', zIndex: 5 },
    sheetLarge: { marginHorizontal: theme.spacing.md, marginBottom: 8 },
    sheetSmall: { marginHorizontal: theme.spacing.sm, marginBottom: 4 },
    owners: { fontSize: 20, fontWeight: '800', color: theme.colors.mustache, marginTop: theme.spacing.md },
    ownersSmall: { fontSize: 16, marginTop: theme.spacing.sm },
    name: { fontSize: 32, fontWeight: '900', color: theme.colors.primaryDark, textAlign: 'center' },
    nameSmall: { fontSize: 24 },
});
