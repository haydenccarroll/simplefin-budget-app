import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, PanResponder, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import apiClient from '../../api/client';
import { useToast } from '../Toast/Toast';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Fab from '../ui/Fab';
import PendingNotice from '../ui/PendingNotice';
import SlideIn from '../ui/SlideIn';
import PullToRefresh from '../ui/PullToRefresh';
import { HUG_MS } from '../Pickle/PickleBuddy';
import PickleBackdrop from '../Pickle/PickleBackdrop';
import PickleRain from '../Pickle/PickleRain';
import HomeBanner, { BANNER_PICKLE_WIDTH } from './HomeBanner';
import BalanceCard from './BalanceCard';
import IncomeSection from './IncomeSection';
import CategorySection from './CategorySection';
import RecentExpenses from './RecentExpenses';
import ProfileLink from './ProfileLink';
import usePendingEntries, { useWaitingExpenses } from '../../utils/usePendingEntries';
import { useMonth } from '../../utils/MonthContext';
import { hapticSelect, hapticSuccess } from '../../utils/haptics';
import theme from '../../theme';
import copy from '../../copy';
import { pick } from '../../utils/fun';
import { formatCurrency, formatMonthLabel, shiftMonthKey } from '../../utils/format';

// How much the two hugging pickles' boxes overlap, as a share of one pickle's width.
const HUG_OVERLAP = 0.38;
// How many of the month's latest expenses the front page lists before "see all".
const RECENT_EXPENSE_COUNT = 5;
// How far (in points) a horizontal drag must go to switch months.
const SWIPE_DISTANCE = 60;
const EDGES = ['top', 'left', 'right'];

export default function Home({ navigation }) {
    const showToast = useToast();
    const { monthKey, setMonthKey } = useMonth();
    // The month on screen, for async work that finishes after the person has swiped to another.
    const monthKeyRef = useRef(monthKey);
    monthKeyRef.current = monthKey;
    const [budget, setBudget] = useState(null);
    // Which month `budget` (or the 404 that says it doesn't exist) belongs to, so nothing reacts to the
    // previous month's numbers in the moment after the month changes and before the new one loads.
    const [loadedMonth, setLoadedMonth] = useState(null);
    const loadedMonthRef = useRef(null);
    const [started, setStarted] = useState(true);
    const [loading, setLoading] = useState(true);
    const [starting, setStarting] = useState(false);
    const [recentExpenses, setRecentExpenses] = useState([]);
    const [expenseCount, setExpenseCount] = useState(0);
    const [hugging, setHugging] = useState(false);
    const [raining, setRaining] = useState(false);
    const [bannerWidth, setBannerWidth] = useState(0);
    const billRef = useRef(null);
    const dillRef = useRef(null);
    // Months the pickles have already hugged over, so a balanced month gets one hug, not one per visit.
    const huggedMonths = useRef(new Set());
    const celebrationBusy = useRef(false);
    const hugTimer = useRef(null);
    const pendingEntries = usePendingEntries(null);
    const { waiting } = useWaitingExpenses(monthKey);
    const recentRows = [...waiting, ...recentExpenses].slice(0, RECENT_EXPENSE_COUNT);
    const { width: windowWidth } = useWindowDimensions();

    // Loading also syncs the bank in the background (sync: false when that is what triggered it).
    // Coming back to a month that's already on screen refreshes it quietly, with no spinner.
    const load = useCallback(async (key, { sync = true } = {}) => {
        if (loadedMonthRef.current !== key) setLoading(true);
        try {
            const [data, expensePage] = await Promise.all([
                apiClient.getBudgetMonth(key),
                // The recent list is a bonus: if it can't load, the rest of the page still shows.
                apiClient.listExpenses(key, 1, RECENT_EXPENSE_COUNT).catch(() => null),
            ]);
            setBudget(data);
            setRecentExpenses(expensePage?.data || []);
            setExpenseCount(expensePage?.total_count || 0);
            setStarted(true);
            loadedMonthRef.current = key;
            setLoadedMonth(key);
            if (sync && !data.offline) {
                // Pulls in new bank transactions without a word: the API skips it when the budget
                // was synced in the last 15 minutes, and anything that goes wrong (no bank linked,
                // no connection) leaves the page as it was.
                apiClient.syncBudgetMonth(key)
                    .then((result) => {
                        const changed = result.expenses_imported + result.income_imported + result.transfers_skipped > 0;
                        if (changed && key === monthKeyRef.current) load(key, { sync: false });
                    })
                    .catch(() => {});
            }
        } catch (error) {
            if (error.status === 404) {
                setBudget(null);
                setRecentExpenses([]);
                setExpenseCount(0);
                setStarted(false);
                loadedMonthRef.current = key;
                setLoadedMonth(key);
            } else if (error.code === 'no_budget') {
                // Not in a budget: the app is already sending them to create or join one.
            } else {
                showToast(copy.home.loadError);
            }
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useFocusEffect(
        useCallback(() => {
            load(monthKey);
        }, [monthKey, load])
    );

    // When entries saved offline finish syncing, reload so the saved copies replace the marked ones.
    const pendingCount = pendingEntries.length;
    const previousPendingCount = useRef(pendingCount);
    useEffect(() => {
        if (pendingCount < previousPendingCount.current) load(monthKey);
        previousPendingCount.current = pendingCount;
    }, [pendingCount, monthKey, load]);

    const totals = budget?.totals || { planned_income: 0, budgeted: 0, left_to_budget: 0, spent: 0 };
    const leftToBudget = totals.left_to_budget;
    // A blank month is technically at zero too, but there's nothing to cheer about yet.
    const balanced = leftToBudget === 0 && totals.planned_income > 0;

    const groups = budget?.category_groups || [];
    const overGroups = groups.filter((group) => group.spent_amount > group.planned_amount);
    // All good means balanced with nothing overspent. Bill and Dill fret if any category is
    // over, or if the budget isn't balanced (a blank month has nothing to fret about yet).
    const allGood = balanced && overGroups.length === 0;
    const distressed = overGroups.length > 0 || leftToBudget !== 0;
    const pickleMood = distressed ? 'worried' : 'happy';

    // The pickles meet in the middle for a hug.
    const hug = () => {
        if (celebrationBusy.current) return;
        celebrationBusy.current = true;
        const distance = ((bannerWidth || windowWidth) - 2 * theme.spacing.lg - BANNER_PICKLE_WIDTH * (2 - HUG_OVERLAP)) / 2;
        billRef.current?.hug(distance);
        dillRef.current?.hug(distance);
        setHugging(true);
        hapticSuccess();
        hugTimer.current = setTimeout(() => {
            setHugging(false);
            celebrationBusy.current = false;
        }, HUG_MS);
    };

    useEffect(() => () => clearTimeout(hugTimer.current), []);

    // They hug when a month is balanced: once as it tips into balance, or the first time you open
    // an already-balanced month. Nothing for other months, and not on every refocus. Only once the
    // month on screen is the month that was asked for.
    const fresh = !loading && loadedMonth === monthKey;
    useEffect(() => {
        if (!fresh) return;
        if (!balanced) {
            huggedMonths.current.delete(monthKey);
        } else if (!huggedMonths.current.has(monthKey)) {
            huggedMonths.current.add(monthKey);
            hug();
        }
    }, [fresh, balanced, monthKey]);

    // Swiping the page left goes to the next month, right to the previous. Only a clearly
    // horizontal drag is taken, so vertical scrolling, pull to refresh and taps are untouched.
    const swipeMonth = useRef(null);
    const swipeResponder = useRef(PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderRelease: (_, g) => {
            if (Math.abs(g.dx) < SWIPE_DISTANCE) return;
            swipeMonth.current(g.dx < 0 ? 1 : -1);
        },
    })).current;

    // Which way the page turns when the month changes (1 = forward in time). The month can be
    // changed from here, the year view, so this is worked out from the change
    // itself.
    const slideDirection = useRef(1);
    const shownMonth = useRef(monthKey);
    if (shownMonth.current !== monthKey) {
        slideDirection.current = monthKey > shownMonth.current ? 1 : -1;
        shownMonth.current = monthKey;
    }

    const changeMonth = (delta) => {
        hapticSelect();
        setMonthKey((k) => shiftMonthKey(k, delta));
    };
    swipeMonth.current = changeMonth;

    const randomPickle = () => (Math.random() < 0.5 ? billRef : dillRef).current;

    // Released a long-enough pull: pickles plaster the screen and one of the pair comments.
    const onRefreshTriggered = () => {
        setRaining(true);
        randomPickle()?.say(pick(copy.lines.refresh));
    };

    const startBudget = async () => {
        setStarting(true);
        try {
            const data = await apiClient.startBudgetMonth(monthKey);
            setBudget(data);
            setStarted(true);
        } catch (error) {
            showToast(error.message || copy.home.startError);
        } finally {
            setStarting(false);
        }
    };

    const openMonthPicker = () => navigation.navigate('MonthPicker', { month: monthKey });
    const addExpense = () => navigation.navigate('ExpenseForm', { month: monthKey });

    if (loading && budget === null && started) {
        return (
            <SafeAreaView edges={EDGES} style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.loadingText}>{copy.home.loading}</Text>
            </SafeAreaView>
        );
    }

    const worryMessage = !distressed ? null
        : overGroups.length === 1
            ? copy.home.worryOneJar(overGroups[0].name)
            : overGroups.length > 1
                ? copy.home.worryManyJars(overGroups.length)
                : leftToBudget > 0
                    ? copy.home.worryUnassigned(formatCurrency(leftToBudget))
                    : copy.home.worryOutOfBalance;

    const banner = (
        <HomeBanner
            billRef={billRef}
            dillRef={dillRef}
            mood={pickleMood}
            hugging={hugging}
            worryMessage={worryMessage}
            monthKey={monthKey}
            onPickMonth={openMonthPicker}
            onWidth={setBannerWidth}
        />
    );
    const profileLink = <ProfileLink onPress={() => navigation.navigate('Profile')} />;

    if (!started) {
        return (
            <SafeAreaView edges={EDGES} style={styles.container}>
                <PickleBackdrop />
                {profileLink}
                {banner}
                <View style={styles.startBudgetContainer} {...swipeResponder.panHandlers}>
                    <Card style={styles.startBudgetCard}>
                        <Text style={styles.startBudgetTitle}>{copy.home.startTitle(formatMonthLabel(monthKey))}</Text>
                        <Text style={styles.startBudgetSubtitle}>{copy.home.startBody(formatMonthLabel(shiftMonthKey(monthKey, -1)))}</Text>
                        <Button title={copy.home.startButton} onPress={startBudget} loading={starting} style={{ marginTop: theme.spacing.lg }} />
                    </Card>
                </View>
            </SafeAreaView>
        );
    }

    const blank = leftToBudget === 0 && !balanced;
    const leftMessage = allGood
        ? copy.home.balancedAllGood
        : balanced
            ? copy.home.balancedButOver
            : blank
                ? copy.home.balanceBlank
                : leftToBudget > 0
                    ? copy.home.balanceLeftOver(formatCurrency(leftToBudget))
                    : copy.home.balanceOverspent(formatCurrency(Math.abs(leftToBudget)));

    return (
        <SafeAreaView edges={EDGES} style={styles.container}>
            <PickleBackdrop />
            <View style={{ flex: 1 }} {...swipeResponder.panHandlers}>
            <SlideIn animKey={monthKey} direction={slideDirection.current}>
            <PullToRefresh onRefresh={() => load(monthKey)} onTrigger={onRefreshTriggered}>
                {(scrollProps) => (
                    // The Profile link scrolls away; the banner (child 1) sticks to the top.
                    <ScrollView contentContainerStyle={styles.scrollContent} stickyHeaderIndices={[1]} {...scrollProps}>
                        {profileLink}
                        {banner}
                        <View style={styles.body}>
                            <PendingNotice count={pendingEntries.length} offline={Boolean(budget?.offline)} />
                            <BalanceCard totals={totals} allGood={allGood} message={leftMessage} onCelebrate={hug} />
                            <IncomeSection
                                items={budget?.income_items || []}
                                onAdd={() => navigation.navigate('IncomeItemForm', { month: monthKey })}
                                onOpen={(item) => navigation.navigate('IncomeItemForm', { month: monthKey, incomeItem: item })}
                            />
                            <CategorySection
                                groups={groups}
                                onAdd={() => navigation.navigate('CategoryGroupForm', { month: monthKey })}
                                onOpen={(group) => navigation.navigate('CategoryGroupForm', { month: monthKey, categoryGroup: group })}
                            />
                            <RecentExpenses
                                rows={recentRows}
                                totalCount={expenseCount}
                                shownCount={recentExpenses.length}
                                onAdd={addExpense}
                                onOpen={(item) => navigation.navigate('ExpenseForm', { month: monthKey, expense: item })}
                                onSeeAll={() => navigation.navigate('Expenses')}
                            />
                            <View style={{ height: 100 }} />
                        </View>
                    </ScrollView>
                )}
            </PullToRefresh>
            </SlideIn>
            </View>

            <Fab onPress={addExpense} />

            <PickleRain visible={raining} onDone={() => setRaining(false)} />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },
    loadingText: { ...theme.typography.subheading, color: theme.colors.primaryDark, marginTop: theme.spacing.lg },
    startBudgetContainer: { flex: 1, justifyContent: 'center', paddingHorizontal: theme.spacing.lg },
    startBudgetCard: { alignItems: 'center', paddingVertical: theme.spacing.xl },
    startBudgetTitle: { ...theme.typography.heading, color: theme.colors.primaryDark, textAlign: 'center' },
    startBudgetSubtitle: { ...theme.typography.body, color: theme.colors.textSecondary, textAlign: 'center', marginTop: theme.spacing.sm },
    scrollContent: { paddingBottom: theme.spacing.xl },
    body: { paddingHorizontal: theme.spacing.lg },
});
