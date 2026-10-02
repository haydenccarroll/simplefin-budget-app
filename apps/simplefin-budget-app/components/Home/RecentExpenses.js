import React from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import ExpenseRow from '../ui/ExpenseRow';
import SectionHeader from './SectionHeader';
import copy from '../../copy';
import theme from '../../theme';

export default function RecentExpenses({ rows, totalCount, shownCount, onAdd, onOpen, onSeeAll }) {
    return (
        <>
            <SectionHeader title={copy.home.recentTitle} onAdd={onAdd} addLabel={copy.home.recentAddLabel} />
            <Card style={styles.card}>
                {rows.length === 0 ? (
                    <EmptyState {...copy.home.recentEmpty} />
                ) : (
                    rows.map((item, i) => (
                        <ExpenseRow key={item.id} item={item} style={i > 0 && styles.divider} onPress={() => onOpen(item)} />
                    ))
                )}
                <TouchableOpacity
                    touchSoundDisabled
                    style={[styles.seeAll, rows.length > 0 && styles.divider]}
                    onPress={onSeeAll}
                    accessibilityRole="button"
                >
                    <Text style={styles.seeAllText}>
                        {totalCount > shownCount ? copy.home.seeAll(totalCount) : copy.home.seeEvery}
                    </Text>
                </TouchableOpacity>
            </Card>
        </>
    );
}

const styles = StyleSheet.create({
    card: { marginBottom: theme.spacing.md, padding: 0, overflow: 'hidden' },
    divider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
    seeAll: { alignItems: 'center', paddingVertical: theme.spacing.md },
    seeAllText: { color: theme.colors.primaryDark, fontWeight: '800' },
});
