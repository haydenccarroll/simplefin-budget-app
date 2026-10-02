import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import SectionHeader from './SectionHeader';
import copy from '../../copy';
import theme from '../../theme';
import { formatCurrency, formatDateLabel, formatSource } from '../../utils/format';

export default function IncomeSection({ items, onAdd, onOpen }) {
    return (
        <>
            <SectionHeader title={copy.home.incomeTitle} onAdd={onAdd} addLabel={copy.home.incomeAddLabel} />
            <Card style={styles.card}>
                {items.length === 0 ? (
                    <EmptyState {...copy.home.incomeEmpty} />
                ) : (
                    items.map((item, i) => (
                        <TouchableOpacity
                            touchSoundDisabled
                            key={item.id}
                            style={[styles.row, i > 0 && styles.divider]}
                            onPress={() => onOpen(item)}
                            accessibilityRole="button"
                        >
                            <View style={styles.text}>
                                <Text style={styles.title} numberOfLines={2}>{item.name}</Text>
                                <Text style={styles.meta} numberOfLines={1}>
                                    {[formatDateLabel(item.received_at) || copy.common.mysteryDate, formatSource(item)].filter(Boolean).join(' · ')}
                                </Text>
                            </View>
                            <Text style={styles.value}>{formatCurrency(item.planned_amount)}</Text>
                        </TouchableOpacity>
                    ))
                )}
            </Card>
        </>
    );
}

const styles = StyleSheet.create({
    card: { marginBottom: theme.spacing.md, padding: 0, overflow: 'hidden' },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
    },
    divider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
    text: { flex: 1, marginRight: theme.spacing.md },
    title: { ...theme.typography.body, color: theme.colors.textPrimary },
    meta: { color: theme.colors.textMuted, fontSize: 12, marginTop: 2 },
    value: { ...theme.typography.subheading, color: theme.colors.textPrimary, flexShrink: 0 },
});
