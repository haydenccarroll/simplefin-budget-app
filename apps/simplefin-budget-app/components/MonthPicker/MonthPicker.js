import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, PanResponder } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import apiClient from '../../api/client';
import ScreenHeader from '../ui/ScreenHeader';
import Bouncy from '../ui/Bouncy';
import Card from '../ui/Card';
import SlideIn from '../ui/SlideIn';
import copy from '../../copy';
import theme from '../../theme';
import { currentMonthKey } from '../../utils/format';
import { hapticSelect } from '../../utils/haptics';
import { useMonth } from '../../utils/MonthContext';

const MONTH_NAMES = copy.monthPicker.monthNames;
const SWIPE_DISTANCE = 60;

// The whole calendar year at a glance: walk through years with the arrows (or by swiping)
// and tap a month to jump to it. Months that have a budget are marked.
export default function MonthPicker({ navigation, route }) {
    const { setMonthKey } = useMonth();
    const selected = route.params?.month || currentMonthKey();
    const thisMonth = currentMonthKey();
    const [year, setYear] = useState(Number(selected.split('-')[0]));
    const [started, setStarted] = useState(new Set());
    const direction = useRef(1);

    useEffect(() => {
        apiClient.listBudgetMonths()
            .then((months) => setStarted(new Set((months || []).map((m) => m.month))))
            .catch(() => {}); // the grid still works without the markers
    }, []);

    const changeYear = (delta) => {
        direction.current = delta;
        setYear((y) => y + delta);
    };
    const swipeYear = useRef(null);
    swipeYear.current = changeYear;
    const swipe = useRef(PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderRelease: (_, g) => {
            if (Math.abs(g.dx) >= SWIPE_DISTANCE) swipeYear.current(g.dx < 0 ? 1 : -1);
        },
    })).current;

    const pick = (key) => {
        hapticSelect();
        setMonthKey(key);
        navigation.goBack();
    };

    const budgetedThisYear = MONTH_NAMES.filter((_, i) => started.has(`${year}-${String(i + 1).padStart(2, '0')}`)).length;

    return (
        <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
            <ScreenHeader title={copy.monthPicker.title} onBack={() => navigation.goBack()} />
            <View style={styles.body} {...swipe.panHandlers}>
                <Card style={styles.yearCard}>
                    <TouchableOpacity touchSoundDisabled style={styles.yearArrow} onPress={() => changeYear(-1)} accessibilityLabel={copy.monthPicker.previousYear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={styles.arrowText}>‹</Text>
                    </TouchableOpacity>
                    <SlideIn animKey={year} direction={direction.current} style={styles.yearCenter}>
                        <Text style={styles.year}>{year}</Text>
                        <Text style={styles.yearSub}>
                            {budgetedThisYear === 0 ? copy.monthPicker.noBudgets : copy.monthPicker.budgetedCount(budgetedThisYear)}
                        </Text>
                    </SlideIn>
                    <TouchableOpacity touchSoundDisabled style={styles.yearArrow} onPress={() => changeYear(1)} accessibilityLabel={copy.monthPicker.nextYear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={styles.arrowText}>›</Text>
                    </TouchableOpacity>
                </Card>

                <SlideIn animKey={year} direction={direction.current} style={styles.gridWrap}>
                    <View style={styles.grid}>
                        {MONTH_NAMES.map((name, i) => {
                            const key = `${year}-${String(i + 1).padStart(2, '0')}`;
                            const isSelected = key === selected;
                            const isNow = key === thisMonth;
                            const hasBudget = started.has(key);
                            return (
                                <View key={key} style={styles.cell}>
                                    <Bouncy
                                        style={[styles.tile, hasBudget && styles.tileBudgeted, isNow && styles.tileNow, isSelected && styles.tileSelected]}
                                        onPress={() => pick(key)}
                                        accessibilityLabel={`${name} ${year}`}
                                    >
                                        <Text style={[styles.tileName, isSelected && styles.tileNameSelected]}>{name}</Text>
                                        <Text style={[styles.tileNote, isSelected && styles.tileNoteSelected]}>
                                            {isNow ? copy.monthPicker.thisMonth : hasBudget ? copy.monthPicker.budgeted : copy.monthPicker.notBudgeted}
                                        </Text>
                                    </Bouncy>
                                </View>
                            );
                        })}
                    </View>
                </SlideIn>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    body: { flex: 1, paddingHorizontal: theme.spacing.lg },
    yearCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: theme.spacing.md, marginBottom: theme.spacing.lg },
    yearArrow: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    arrowText: { fontSize: 36, lineHeight: 40, color: theme.colors.textPrimary },
    yearCenter: { alignItems: 'center', justifyContent: 'center' },
    year: { ...theme.typography.title, color: theme.colors.primaryDark, textAlign: 'center' },
    yearSub: { ...theme.typography.caption, color: theme.colors.textMuted, textAlign: 'center', marginTop: 2 },
    gridWrap: { flex: 0 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -theme.spacing.xs },
    cell: { width: '33.333%', padding: theme.spacing.xs },
    tile: {
        height: 84,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radii.lg,
        borderWidth: 2,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
    },
    tileBudgeted: { backgroundColor: theme.colors.primaryTint, borderColor: theme.colors.primary },
    tileNow: { borderColor: theme.colors.mustard, borderWidth: 3 },
    tileSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primaryDark, borderBottomWidth: 4 },
    tileName: { ...theme.typography.heading, color: theme.colors.textPrimary },
    tileNameSelected: { color: theme.colors.textInverse },
    tileNote: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 2 },
    tileNoteSelected: { color: theme.colors.textInverse },
});
