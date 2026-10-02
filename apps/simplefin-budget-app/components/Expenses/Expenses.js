import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import apiClient from '../../api/client';
import { useToast } from '../Toast/Toast';
import ScreenHeader from '../ui/ScreenHeader';
import EmptyState from '../ui/EmptyState';
import ExpenseRow from '../ui/ExpenseRow';
import Fab from '../ui/Fab';
import PendingNotice from '../ui/PendingNotice';
import PullToRefresh from '../ui/PullToRefresh';
import { useWaitingExpenses } from '../../utils/usePendingEntries';
import { useMonth } from '../../utils/MonthContext';
import { showFunPopup } from '../../utils/fun';
import copy from '../../copy';
import theme from '../../theme';
import { formatMonthLabel } from '../../utils/format';

const EDGES = ['top', 'left', 'right'];

// Every expense in the month on screen (the month is picked on the Budget page). Swipe a row
// left to delete it.
export default function Expenses({ navigation }) {
    const showToast = useToast();
    const { monthKey: month } = useMonth();
    const [expenses, setExpenses] = useState([]);
    // Which month `expenses` is for. The spinner only shows while there's nothing for the month on
    // screen; coming back just refreshes the list underneath what's already there.
    const [loadedMonth, setLoadedMonth] = useState(null);
    const { waiting, pendingCount } = useWaitingExpenses(month);

    const load = useCallback(async () => {
        try {
            const all = await apiClient.listAllExpenses(month);
            setExpenses(all);
            setLoadedMonth(month);
        } catch (error) {
            showToast(copy.expenses.loadError);
        }
    }, [month, showToast]);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    // When one goes through, the list reloads so the saved copy replaces the marked one.
    const previousPendingCount = useRef(pendingCount);
    useEffect(() => {
        if (pendingCount < previousPendingCount.current) load();
        previousPendingCount.current = pendingCount;
    }, [pendingCount, load]);

    const remove = useCallback(async (item) => {
        try {
            await apiClient.deleteExpense(item.id);
            setExpenses((current) => current.filter((e) => e.id !== item.id));
            showFunPopup('expenseDeleted');
        } catch (error) {
            showToast(copy.expenses.deleteError);
        }
    }, [showToast]);

    // A stable array, so the list isn't handed new data on every render.
    const rows = useMemo(() => [...waiting, ...expenses], [waiting, expenses]);

    // Still showing another month's list (or none yet): spin rather than show the wrong month's.
    const loading = loadedMonth !== month;

    return (
        <SafeAreaView edges={EDGES} style={styles.container}>
            <ScreenHeader title={`${copy.expenses.title} · ${formatMonthLabel(month)}`} onBack={() => navigation.goBack()} />
            <PendingNotice count={pendingCount} />
            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            ) : (
                <PullToRefresh onRefresh={load}>
                    {(scrollProps) => (
                        <FlatList
                            {...scrollProps}
                            data={rows}
                            keyExtractor={(item) => String(item.id)}
                            contentContainerStyle={styles.listContent}
                            ListEmptyComponent={<EmptyState {...copy.expenses.empty} />}
                            renderItem={({ item }) => (
                                <ExpenseRow
                                    item={item}
                                    style={styles.row}
                                    onPress={() => navigation.navigate('ExpenseForm', { month, expense: item })}
                                    onDelete={remove}
                                />
                            )}
                        />
                    )}
                </PullToRefresh>
            )}
            <Fab onPress={() => navigation.navigate('ExpenseForm', { month })} />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    listContent: { paddingHorizontal: theme.spacing.lg, paddingBottom: 100 },
    row: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.md,
        borderWidth: 2,
        borderColor: theme.colors.border,
        marginBottom: theme.spacing.sm,
    },
});
