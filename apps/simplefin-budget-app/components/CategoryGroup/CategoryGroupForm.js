import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import apiClient from '../../api/client';
import { useToast } from '../Toast/Toast';
import KeyboardAwareScroll from '../ui/KeyboardAwareScroll';
import ScreenHeader, { TrashButton } from '../ui/ScreenHeader';
import TextField, { AmountField } from '../ui/TextField';
import Bouncy from '../ui/Bouncy';
import Button from '../ui/Button';
import ConfirmModal from '../ui/ConfirmModal';
import ExpenseRow from '../ui/ExpenseRow';
import EmptyState from '../ui/EmptyState';
import copy from '../../copy';
import theme from '../../theme';
import { formatCurrency } from '../../utils/format';
import { showFunPopup } from '../../utils/fun';
import { hapticSuccess } from '../../utils/haptics';

export default function CategoryGroupForm({ navigation, route }) {
    const showToast = useToast();
    const { month, categoryGroup } = route.params || {};
    const isEditing = Boolean(categoryGroup);

    const [name, setName] = useState(categoryGroup?.name || '');
    const [plannedAmount, setPlannedAmount] = useState(categoryGroup ? String(categoryGroup.planned_amount) : '');
    const [description, setDescription] = useState(categoryGroup?.description || '');
    const [saving, setSaving] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    const save = async () => {
        if (!name.trim()) {
            showToast(copy.categoryForm.needsName);
            return;
        }
        setSaving(true);
        try {
            const amount = parseFloat(plannedAmount) || 0;
            if (isEditing) {
                await apiClient.updateCategoryGroup(categoryGroup.id, { name: name.trim(), plannedAmount: amount, sortOrder: categoryGroup.sort_order, description: description.trim() });
            } else {
                await apiClient.createCategoryGroup(month, { name: name.trim(), plannedAmount: amount, description: description.trim() });
            }
            hapticSuccess();
            showFunPopup(isEditing ? 'categoryUpdated' : 'categoryAdded');
            navigation.goBack();
        } catch (error) {
            showToast(error.message || copy.categoryForm.saveError);
        } finally {
            setSaving(false);
        }
    };

    // How much of the month's income is still unassigned, not counting this jar's saved amount,
    // so the figures below update as the amount is typed.
    const [unassignedElsewhere, setUnassignedElsewhere] = useState(null);
    useEffect(() => {
        let active = true;
        apiClient.getBudgetMonth(month)
            .then((budget) => {
                if (!active) return;
                const left = budget?.totals?.left_to_budget ?? 0;
                setUnassignedElsewhere(left + (categoryGroup?.planned_amount || 0));
            })
            .catch(() => {});
        return () => { active = false; };
    }, [month, categoryGroup?.id]);

    const cents = (n) => Math.round(n * 100) / 100;
    const afterThis = unassignedElsewhere == null ? null : cents(unassignedElsewhere - (parseFloat(plannedAmount) || 0));
    const rest = unassignedElsewhere == null ? 0 : Math.max(0, cents(unassignedElsewhere));
    const canUseRest = rest > 0 && cents(parseFloat(plannedAmount) || 0) !== rest;

    // Frees up whatever this jar didn't use, e.g. to zero out a finished month's leftovers.
    const spent = cents(categoryGroup?.spent_amount || 0);
    const canShrink = isEditing && cents(parseFloat(plannedAmount) || 0) > spent;

    // The expenses in this category, refreshed whenever you come back to the screen.
    const [expenses, setExpenses] = useState(null);
    useFocusEffect(useCallback(() => {
        if (!isEditing) return undefined;
        let active = true;
        apiClient.listAllExpenses(month)
            .then((all) => { if (active) setExpenses(all.filter((e) => e.category_group_id === categoryGroup.id)); })
            .catch(() => { if (active) showToast(copy.expenses.loadError); });
        return () => { active = false; };
    }, [month, isEditing, categoryGroup?.id, showToast]));

    const removeExpense = async (item) => {
        try {
            await apiClient.deleteExpense(item.id);
            setExpenses((current) => current.filter((e) => e.id !== item.id));
            showFunPopup('expenseDeleted');
        } catch (error) {
            showToast(copy.expenses.deleteError);
        }
    };

    const remove = async () => {
        setSaving(true);
        try {
            await apiClient.deleteCategoryGroup(categoryGroup.id);
            showFunPopup('categoryDeleted');
            navigation.goBack();
        } catch (error) {
            showToast(copy.categoryForm.deleteError);
            setSaving(false);
            setConfirmingDelete(false);
        }
    };

    return (
        <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
            <ScreenHeader title={isEditing ? copy.categoryForm.titleEdit : copy.categoryForm.titleAdd} onBack={() => navigation.goBack()} right={isEditing ? <TrashButton onPress={() => setConfirmingDelete(true)} disabled={saving} /> : undefined} />
            <KeyboardAwareScroll
                contentContainerStyle={styles.content}
            >
                <TextField label={copy.categoryForm.nameLabel} placeholder={copy.categoryForm.namePlaceholder} value={name} onChangeText={setName} />
                <AmountField label={copy.categoryForm.amountLabel} value={plannedAmount} onChangeValue={setPlannedAmount} style={styles.amountField} />
                {afterThis !== null || canShrink ? (
                    <View style={styles.balanceRow}>
                        {afterThis !== null ? <Text style={[styles.balanceText, afterThis === 0 ? styles.balanceGood : afterThis < 0 ? styles.balanceOver : styles.balanceLeft]}>
                            {afterThis === 0
                                ? copy.categoryForm.unassignedZero
                                : afterThis > 0
                                    ? copy.categoryForm.unassignedLeft(formatCurrency(afterThis))
                                    : copy.categoryForm.unassignedOver(formatCurrency(-afterThis))}
                        </Text> : null}
                        {canUseRest ? (
                            <Bouncy style={styles.restChip} onPress={() => setPlannedAmount(String(rest))}>
                                <Text style={styles.restChipText}>{copy.categoryForm.useTheRest(formatCurrency(rest))}</Text>
                            </Bouncy>
                        ) : null}
                        {canShrink ? (
                            <Bouncy style={styles.restChip} onPress={() => setPlannedAmount(String(spent))}>
                                <Text style={styles.restChipText}>{copy.categoryForm.shrinkToSpent(formatCurrency(spent))}</Text>
                            </Bouncy>
                        ) : null}
                    </View>
                ) : null}
                <TextField
                    label={copy.categoryForm.descriptionLabel}
                    placeholder={copy.categoryForm.descriptionPlaceholder}
                    value={description}
                    onChangeText={setDescription}
                    maxLength={500}
                    multiline
                />
                <Text style={styles.hint}>{copy.categoryForm.descriptionHint}</Text>
                {isEditing && expenses !== null ? (
                    <View style={styles.expenses}>
                        <Text style={styles.expensesTitle}>{copy.expenses.categoryTitle}</Text>
                        <View style={styles.expensesCard}>
                            {expenses.length === 0 ? (
                                <EmptyState {...copy.expenses.categoryEmpty} />
                            ) : (
                                expenses.map((item, i) => (
                                    <ExpenseRow
                                        key={item.id}
                                        item={item}
                                        style={i > 0 && styles.divider}
                                        onPress={() => navigation.navigate('ExpenseForm', { month, expense: item })}
                                        onDelete={removeExpense}
                                    />
                                ))
                            )}
                        </View>
                        <Button
                            title={copy.expenses.categoryAdd}
                            variant="secondary"
                            onPress={() => navigation.navigate('ExpenseForm', { month, categoryGroupId: categoryGroup.id })}
                            style={{ marginTop: theme.spacing.md }}
                        />
                    </View>
                ) : null}
                <Button title={copy.common.save} onPress={save} loading={saving} style={{ marginTop: theme.spacing.sm }} />
            </KeyboardAwareScroll>
            <ConfirmModal
                visible={confirmingDelete}
                title={copy.categoryForm.deleteTitle}
                message={copy.categoryForm.deleteMessage}
                confirmLabel={copy.categoryForm.delete}
                danger
                busy={saving}
                onConfirm={remove}
                onCancel={() => setConfirmingDelete(false)}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: theme.spacing.lg, paddingBottom: 200 },
    expenses: { marginBottom: theme.spacing.lg },
    expensesTitle: { ...theme.typography.subheading, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm },
    expensesCard: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.md,
        borderWidth: 2,
        borderColor: theme.colors.border,
        overflow: 'hidden',
    },
    divider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
    amountField: { marginBottom: theme.spacing.sm },
    balanceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: theme.spacing.lg },
    balanceText: { ...theme.typography.label, flexShrink: 1, marginRight: theme.spacing.md, marginBottom: theme.spacing.xs },
    balanceGood: { color: theme.colors.primaryDark },
    balanceLeft: { color: theme.colors.mustache },
    balanceOver: { color: theme.colors.critical },
    restChip: {
        backgroundColor: theme.colors.mustardTint,
        borderWidth: 1,
        borderColor: theme.colors.mustard,
        borderRadius: theme.radii.md,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        marginBottom: theme.spacing.xs,
        marginRight: theme.spacing.sm,
    },
    restChipText: { ...theme.typography.label, color: theme.colors.mustache },
    hint: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: -theme.spacing.sm, marginBottom: theme.spacing.lg },
});
