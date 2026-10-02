import React, { useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import apiClient from '../../api/client';
import { useToast } from '../Toast/Toast';
import KeyboardAwareScroll from '../ui/KeyboardAwareScroll';
import ScreenHeader, { TrashButton } from '../ui/ScreenHeader';
import TextField, { AmountField } from '../ui/TextField';
import Button from '../ui/Button';
import ConfirmModal from '../ui/ConfirmModal';
import DateQuickPick from '../ui/DateQuickPick';
import copy from '../../copy';
import theme from '../../theme';
import { formatSource } from '../../utils/format';
import { showFunPopup } from '../../utils/fun';
import { hapticSuccess } from '../../utils/haptics';
import { enqueue, newClientId, syncPending } from '../../utils/offlineQueue';

export default function IncomeItemForm({ navigation, route }) {
    const showToast = useToast();
    const { month, incomeItem } = route.params || {};
    const isEditing = Boolean(incomeItem);

    const [name, setName] = useState(incomeItem?.name || '');
    const [plannedAmount, setPlannedAmount] = useState(incomeItem ? String(incomeItem.planned_amount) : '');
    const [dateISO, setDateISO] = useState(incomeItem?.received_at ?? null);
    const [saving, setSaving] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    // Lets the API ignore a repeat of this entry if it was already saved when a retry comes in.
    const clientId = useRef(newClientId()).current;

    const save = async () => {
        if (!name.trim()) {
            showToast(copy.incomeForm.needsName);
            return;
        }
        setSaving(true);
        try {
            const planned = parseFloat(plannedAmount) || 0;
            if (isEditing) {
                await apiClient.updateIncomeItem(incomeItem.id, {
                    name: name.trim(),
                    plannedAmount: planned,
                    receivedAt: dateISO,
                    sortOrder: incomeItem.sort_order,
                });
            } else {
                const payload = { name: name.trim(), plannedAmount: planned, receivedAt: dateISO };
                try {
                    await apiClient.createIncomeItem(month, { ...payload, clientId });
                } catch (error) {
                    if (!error.isNetworkError) throw error;
                    // No connection: keep it on this phone and send it later.
                    await enqueue({ kind: 'income', month, clientId, payload });
                    hapticSuccess();
                    showFunPopup('savedOffline');
                    navigation.goBack();
                    return;
                }
            }
            hapticSuccess();
            showFunPopup(isEditing ? 'incomeUpdated' : 'incomeAdded');
            syncPending(); // the connection is evidently up, so send anything that was waiting
            navigation.goBack();
        } catch (error) {
            showToast(error.message || copy.incomeForm.saveError);
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        setSaving(true);
        try {
            await apiClient.deleteIncomeItem(incomeItem.id);
            showFunPopup('incomeDeleted');
            navigation.goBack();
        } catch (error) {
            showToast(copy.incomeForm.deleteError);
            setSaving(false);
            setConfirmingDelete(false);
        }
    };

    return (
        <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
            <ScreenHeader title={isEditing ? copy.incomeForm.titleEdit : copy.incomeForm.titleAdd} onBack={() => navigation.goBack()} right={isEditing ? <TrashButton onPress={() => setConfirmingDelete(true)} disabled={saving} /> : undefined} />
            <KeyboardAwareScroll
                contentContainerStyle={styles.content}
            >
                {isEditing && formatSource(incomeItem) ? <Text style={styles.source}>{formatSource(incomeItem)}</Text> : null}
                <TextField label={copy.incomeForm.nameLabel} placeholder={copy.incomeForm.namePlaceholder} value={name} onChangeText={setName} />
                <AmountField label={copy.common.amountLabel} value={plannedAmount} onChangeValue={setPlannedAmount} />

                <DateQuickPick value={dateISO} onChange={setDateISO} />

                <Button title={copy.common.save} onPress={save} loading={saving} style={{ marginTop: theme.spacing.sm }} />
            </KeyboardAwareScroll>
            <ConfirmModal
                visible={confirmingDelete}
                title={copy.incomeForm.deleteTitle}
                message={copy.incomeForm.deleteMessage}
                confirmLabel={copy.incomeForm.delete}
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
    source: { ...theme.typography.label, color: theme.colors.textMuted, marginBottom: theme.spacing.md },
    label: {
        ...theme.typography.label,
        color: theme.colors.textSecondary,
        marginBottom: theme.spacing.xs,
    },
});
