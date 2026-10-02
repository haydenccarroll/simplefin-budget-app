import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Card from '../ui/Card';
import Meter from '../ui/Meter';
import EmptyState from '../ui/EmptyState';
import SectionHeader from './SectionHeader';
import copy from '../../copy';
import theme from '../../theme';
import { formatCurrency } from '../../utils/format';

export default function CategorySection({ groups, onAdd, onOpen }) {
    return (
        <>
            <SectionHeader title={copy.home.categoriesTitle} onAdd={onAdd} addLabel={copy.home.categoriesAddLabel} />
            {groups.length === 0 ? (
                <Card style={styles.card}>
                    <EmptyState {...copy.home.categoriesEmpty} />
                </Card>
            ) : (
                groups.map((group) => {
                    // Spending against a $0 plan counts as over.
                    const ratio = group.planned_amount > 0 ? group.spent_amount / group.planned_amount : group.spent_amount > 0 ? 2 : 0;
                    return (
                        <Card key={group.id} style={styles.card}>
                            <TouchableOpacity touchSoundDisabled style={styles.header} onPress={() => onOpen(group)} accessibilityRole="button">
                                <Text style={styles.title}>{group.name}</Text>
                                <Text style={styles.amounts}>
                                    {formatCurrency(group.spent_amount)} <Text style={styles.amountsMuted}>{copy.home.categoryOf(formatCurrency(group.planned_amount))}</Text>
                                </Text>
                            </TouchableOpacity>
                            <View style={styles.meterWrap}>
                                <Meter ratio={ratio} />
                            </View>
                        </Card>
                    );
                })
            )}
        </>
    );
}

const styles = StyleSheet.create({
    card: { marginBottom: theme.spacing.md, padding: 0, overflow: 'hidden' },
    header: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.md },
    title: { ...theme.typography.subheading, color: theme.colors.textPrimary },
    amounts: { ...theme.typography.body, color: theme.colors.textPrimary, marginTop: 2 },
    amountsMuted: { color: theme.colors.textMuted, fontWeight: '400' },
    meterWrap: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg },
});
