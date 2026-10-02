import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import Card from '../ui/Card';
import StatTile from '../ui/StatTile';
import copy from '../../copy';
import theme from '../../theme';
import { formatCurrency, formatSignedCurrency } from '../../utils/format';

// The month at a glance: how much is left to give a job, with a line saying what that means.
// When everything is perfect the message is tappable, to replay the celebration.
export default function BalanceCard({ totals, allGood, message, onCelebrate }) {
    const left = totals.left_to_budget;
    const tone = left === 0 ? 'good' : left < 0 ? 'critical' : 'default';
    return (
        <Card style={styles.card}>
            <Text style={styles.label}>{copy.home.balanceLabel}</Text>
            <Text
                style={[
                    styles.value,
                    tone === 'good' && { color: theme.colors.primary },
                    tone === 'critical' && { color: theme.colors.critical },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
            >
                {formatSignedCurrency(left)}
            </Text>
            {allGood ? (
                <TouchableOpacity touchSoundDisabled onPress={onCelebrate} activeOpacity={0.7} accessibilityRole="button">
                    <Text style={styles.cheer}>{copy.home.balanceCheer}</Text>
                    <Text style={styles.message}>{message}</Text>
                    <Text style={styles.replay}>{copy.home.balanceReplay}</Text>
                </TouchableOpacity>
            ) : (
                <Text style={styles.message}>{message}</Text>
            )}
            <View style={styles.statsRow}>
                <StatTile label={copy.home.plannedIncome} value={formatCurrency(totals.planned_income)} />
                <StatTile label={copy.home.budgeted} value={formatCurrency(totals.budgeted)} align="flex-end" />
            </View>
        </Card>
    );
}

const styles = StyleSheet.create({
    card: { marginBottom: theme.spacing.lg, alignItems: 'center', paddingVertical: theme.spacing.xl },
    label: { ...theme.typography.label, color: theme.colors.textSecondary, letterSpacing: 0.6 },
    value: { ...theme.typography.hero, color: theme.colors.textPrimary, marginTop: theme.spacing.xs, maxWidth: '100%' },
    cheer: { fontSize: 24, fontWeight: '900', color: theme.colors.primary, textAlign: 'center', marginTop: theme.spacing.sm },
    message: { ...theme.typography.body, color: theme.colors.textSecondary, marginTop: theme.spacing.sm, textAlign: 'center' },
    replay: { ...theme.typography.caption, color: theme.colors.textMuted, textAlign: 'center', marginTop: theme.spacing.xs },
    statsRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: theme.spacing.xl },
});
