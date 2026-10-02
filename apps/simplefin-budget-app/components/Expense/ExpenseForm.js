import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import apiClient from '../../api/client';
import { useToast } from '../Toast/Toast';
import KeyboardAwareScroll from '../ui/KeyboardAwareScroll';
import ScreenHeader, { TrashButton } from '../ui/ScreenHeader';
import TextField, { AmountField } from '../ui/TextField';
import SelectField from '../ui/SelectField';
import Button from '../ui/Button';
import DateQuickPick from '../ui/DateQuickPick';
import ConfirmModal from '../ui/ConfirmModal';
import copy from '../../copy';
import theme from '../../theme';
import { formatSource } from '../../utils/format';
import { showFunPopup } from '../../utils/fun';
import { enqueue, newClientId, syncPending } from '../../utils/offlineQueue';
import { hapticSuccess } from '../../utils/haptics';
import { recallJarId, rememberJar } from '../../utils/lastJar';

export default function ExpenseForm({ navigation, route }) {
    const showToast = useToast();
    const { month, categoryGroupId, expense } = route.params || {};
    const isEditing = Boolean(expense);

    const [description, setDescription] = useState(expense?.description || '');
    const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
    const [note, setNote] = useState(expense?.note || '');
    const [dateISO, setDateISO] = useState(expense?.transacted_at ?? null);
    const [selectedCategoryGroupId, setSelectedCategoryGroupId] = useState(expense?.category_group_id ?? categoryGroupId ?? null);
    const [categoryOptions, setCategoryOptions] = useState([]);
    const [saving, setSaving] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    // Lets the API ignore a repeat of this entry if it was already saved when a retry comes in.
    const clientId = useRef(newClientId()).current;

    useEffect(() => {
        apiClient.getBudgetMonth(month)
            .then(async (budget) => {
                const options = (budget.category_groups || []).map((group) => ({ id: group.id, label: group.name }));
                setCategoryOptions(options);
                // A new expense starts in the jar the last one went into, unless it came with one.
                if (!isEditing && categoryGroupId == null) {
                    const lastId = await recallJarId(options);
                    if (lastId != null) setSelectedCategoryGroupId((current) => current ?? lastId);
                }
            })
            .catch(() => showToast(copy.expenseForm.loadJarsError));
    }, [month]);

    const save = async () => {
        if (!description.trim()) {
            showToast(copy.expenseForm.needsDescription);
            return;
        }
        setSaving(true);
        try {
            const payload = {
                categoryGroupId: selectedCategoryGroupId,
                description: description.trim(),
                amount: parseFloat(amount) || 0,
                transactedAt: dateISO,
                note: note.trim() || null,
            };
            const category = categoryOptions.find((opt) => opt.id === payload.categoryGroupId);
            if (isEditing) {
                await apiClient.updateExpense(expense.id, payload);
            } else {
                try {
                    await apiClient.createExpense(month, { ...payload, clientId });
                } catch (error) {
                    if (!error.isNetworkError) throw error;
                    // No connection: keep it on this phone and send it later.
                    await enqueue({ kind: 'expense', month, clientId, payload, display: { categoryName: category?.label ?? null } });
                    rememberJar(category);
                    hapticSuccess();
                    showFunPopup('savedOffline');
                    navigation.goBack();
                    return;
                }
            }
            rememberJar(category);
            hapticSuccess();
            showFunPopup(isEditing ? 'expenseUpdated' : 'expenseAdded', { amount: payload.amount });
            syncPending(); // the connection is evidently up, so send anything that was waiting
            navigation.goBack();
        } catch (error) {
            showToast(error.message || copy.expenseForm.saveError);
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        setSaving(true);
        try {
            await apiClient.deleteExpense(expense.id);
            showFunPopup('expenseDeleted');
            navigation.goBack();
        } catch (error) {
            showToast(copy.expenseForm.deleteError);
            setSaving(false);
            setConfirmingDelete(false);
        }
    };

    return (
        <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
            <ScreenHeader title={isEditing ? copy.expenseForm.titleEdit : copy.expenseForm.titleAdd} onBack={() => navigation.goBack()} right={isEditing ? <TrashButton onPress={() => setConfirmingDelete(true)} disabled={saving} /> : undefined} />
            <KeyboardAwareScroll
                contentContainerStyle={styles.content}
            >
                {isEditing && formatSource(expense) ? <Text style={styles.source}>{formatSource(expense)}</Text> : null}
                <DateQuickPick value={dateISO} onChange={setDateISO} />

                <TextField label={copy.expenseForm.descriptionLabel} placeholder={copy.expenseForm.descriptionPlaceholder} value={description} onChangeText={setDescription} />
                <AmountField label={copy.common.amountLabel} value={amount} onChangeValue={setAmount} />

                <SelectField
                    label={copy.expenseForm.jarLabel}
                    value={selectedCategoryGroupId == null ? '' : selectedCategoryGroupId}
                    onChange={(value) => setSelectedCategoryGroupId(value === '' ? null : value)}
                    options={[{ value: '', label: copy.expenseForm.unassigned }, ...categoryOptions.map((opt) => ({ value: opt.id, label: opt.label }))]}
                />

                {expense?.auto_categorized && selectedCategoryGroupId === expense.category_group_id ? (
                    <Text style={styles.autoHint}>
                        {copy.expenseForm.autoJarHint}
                    </Text>
                ) : null}

                <TextField label={copy.expenseForm.noteLabel} placeholder={copy.expenseForm.notePlaceholder} value={note} onChangeText={setNote} />

                <Button title={copy.common.save} onPress={save} loading={saving} style={{ marginTop: theme.spacing.sm }} />
            </KeyboardAwareScroll>
            <ConfirmModal
                visible={confirmingDelete}
                title={copy.expenseForm.deleteTitle}
                message={copy.expenseForm.deleteMessage}
                confirmLabel={copy.expenseForm.delete}
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
    label: { ...theme.typography.label, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs },
    pickerWrap: {
        borderRadius: theme.radii.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        marginBottom: theme.spacing.lg,
        overflow: 'hidden',
    },
    autoHint: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: -theme.spacing.sm, marginBottom: theme.spacing.lg },
    source: { ...theme.typography.label, color: theme.colors.textMuted, marginBottom: theme.spacing.md },
});
