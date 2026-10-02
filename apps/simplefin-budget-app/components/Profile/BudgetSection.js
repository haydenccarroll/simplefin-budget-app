import React, { useState } from 'react';
import { View, Text, StyleSheet, Share } from 'react-native';
import apiClient from '../../api/client';
import Card from '../ui/Card';
import Button from '../ui/Button';
import ConfirmModal from '../ui/ConfirmModal';
import copy from '../../copy';
import theme from '../../theme';
import { shareCsv } from '../../utils/exportCsv';
import { showFunPopup } from '../../utils/fun';
import { resetRootTo } from '../../utils/rootNav';

// Everything about the budget itself, in settings: the friend code to share (or none, to
// keep people out), who's
// in it (and, for the owner, removing them), exporting it, and wiping it.
export default function BudgetSection({ budget, onChanged, navigation, showToast }) {
    // Which confirmation is open: null, 'code', 'disable-code', 'delete-all', { remove: member } or 'leave'.
    const [confirm, setConfirm] = useState(null);
    const [busy, setBusy] = useState(false);
    const [exporting, setExporting] = useState(false);

    if (!budget) return null;
    const isOwner = budget.is_owner;

    const fail = (error, fallback) => showToast(error.message || fallback, 'error');

    const shareCode = async () => {
        try {
            await Share.share({ message: copy.budgetSection.shareMessage(budget.friend_code) });
        } catch (error) {
            fail(error, copy.budgetSection.shareError);
        }
    };

    const exportCsv = async () => {
        setExporting(true);
        try {
            const { csv, filename } = await apiClient.exportBudgetCsv();
            await shareCsv(csv, filename);
        } catch (error) {
            fail(error, copy.budgetSection.exportError);
        } finally {
            setExporting(false);
        }
    };

    // Runs a confirmed action, closes the dialog, and reports failures.
    const run = async (action, fallback) => {
        setBusy(true);
        try {
            await action();
        } catch (error) {
            fail(error, fallback);
        } finally {
            setBusy(false);
            setConfirm(null);
        }
    };

    const rotateCode = () => run(async () => {
        await apiClient.rotateFriendCode();
        showFunPopup('friendCodeChanged');
        await onChanged();
    }, copy.budgetSection.freshCodeError);

    // Generating the first code needs no confirmation: nothing stops working.
    const generateCode = () => run(async () => {
        await apiClient.rotateFriendCode();
        showFunPopup('friendCodeChanged');
        await onChanged();
    }, copy.budgetSection.makeCodeError);

    const disableCode = () => run(async () => {
        await apiClient.disableFriendCode();
        showFunPopup('friendCodeDeleted');
        await onChanged();
    }, copy.budgetSection.deleteCodeError);

    const removeMember = (member) => run(async () => {
        await apiClient.removeBudgetMember(member.user_id);
        showFunPopup('memberRemoved');
        await onChanged();
    }, copy.budgetSection.removeError);

    const leave = () => run(async () => {
        const me = budget.members.find((m) => m.is_you);
        await apiClient.removeBudgetMember(me.user_id);
        resetRootTo(navigation, 'Onboarding');
    }, copy.budgetSection.leaveError);

    const deleteAll = () => run(async () => {
        await apiClient.deleteAllBudgetData();
        showFunPopup('dataDeleted');
        // No budget left: back to create-or-join, where they can start or join another.
        resetRootTo(navigation, 'Onboarding');
    }, copy.budgetSection.deleteAllError);

    const removing = confirm?.remove;

    return (
        <View style={styles.container}>
            <Text style={styles.heading}>{copy.budgetSection.heading}</Text>

            <Card style={styles.card}>
                <Text style={styles.label}>{copy.budgetSection.friendCodeLabel}</Text>
                {budget.friend_code ? (
                    <>
                        <Text style={styles.code} selectable>{budget.friend_code}</Text>
                        <Text style={styles.hint}>{copy.budgetSection.friendCodeHint}</Text>
                        <Button title={copy.budgetSection.shareCode} onPress={shareCode} style={styles.button} />
                        {isOwner ? (
                            <>
                                <Button title={copy.budgetSection.freshCode} variant="ghost" onPress={() => setConfirm('code')} style={styles.button} />
                                <Button title={copy.budgetSection.deleteCode} variant="ghost" onPress={() => setConfirm('disable-code')} style={styles.button} />
                            </>
                        ) : null}
                    </>
                ) : (
                    <>
                        <Text style={styles.noCode}>{copy.budgetSection.joiningOff}</Text>
                        <Text style={styles.hint}>
                            {isOwner ? copy.budgetSection.joiningOffOwner : copy.budgetSection.joiningOffMember}
                        </Text>
                        {isOwner ? (
                            <Button title={copy.budgetSection.makeCode} onPress={generateCode} loading={busy} style={styles.button} />
                        ) : null}
                    </>
                )}
            </Card>

            <Card style={styles.card}>
                <Text style={styles.label}>{copy.budgetSection.membersLabel(budget.members.length)}</Text>
                {budget.members.map((member, i) => (
                    <View key={member.user_id} style={[styles.memberRow, i > 0 && styles.memberDivider]}>
                        <View style={styles.memberText}>
                            <Text style={styles.memberName} numberOfLines={1}>
                                {[member.first_name, member.last_name].filter(Boolean).join(' ') || copy.budgetSection.mysteryMember}
                                {member.is_you ? copy.budgetSection.you : ''}
                            </Text>
                            <Text style={styles.memberUsername} numberOfLines={1}>@{member.username}</Text>
                        </View>
                        {member.is_owner ? (
                            <View style={styles.ownerBadge}>
                                <Text style={styles.ownerBadgeText}>{copy.budgetSection.ownerBadge}</Text>
                            </View>
                        ) : isOwner ? (
                            <Button title={copy.budgetSection.remove} variant="ghost" onPress={() => setConfirm({ remove: member })} style={styles.removeButton} />
                        ) : null}
                    </View>
                ))}
                {!isOwner ? (
                    <Button title={copy.budgetSection.leave} variant="ghost" onPress={() => setConfirm('leave')} style={styles.button} />
                ) : null}
            </Card>

            <Card style={styles.card}>
                <Text style={styles.label}>{copy.budgetSection.dataLabel}</Text>
                <Text style={styles.hint}>{copy.budgetSection.dataHint}</Text>
                <Button title={copy.budgetSection.export} variant="secondary" onPress={exportCsv} loading={exporting} style={styles.button} />
                {isOwner ? (
                    <>
                        <Button title={copy.budgetSection.deleteAll} variant="danger" onPress={() => setConfirm('delete-all')} style={styles.button} />
                        <Text style={styles.hint}>{copy.budgetSection.deleteAllHint}</Text>
                    </>
                ) : (
                    <Text style={styles.hint}>{copy.budgetSection.deleteAllNotOwner}</Text>
                )}
            </Card>

            <ConfirmModal
                visible={confirm === 'code'}
                {...copy.budgetSection.confirmFreshCode}
                busy={busy}
                onConfirm={rotateCode}
                onCancel={() => setConfirm(null)}
            />
            <ConfirmModal
                visible={confirm === 'disable-code'}
                {...copy.budgetSection.confirmDeleteCode}
                danger
                busy={busy}
                onConfirm={disableCode}
                onCancel={() => setConfirm(null)}
            />
            <ConfirmModal
                visible={Boolean(removing)}
                title={copy.budgetSection.confirmRemove.title(removing?.first_name)}
                message={copy.budgetSection.confirmRemove.message}
                confirmLabel={copy.budgetSection.confirmRemove.confirmLabel}
                danger
                busy={busy}
                onConfirm={() => removeMember(removing)}
                onCancel={() => setConfirm(null)}
            />
            <ConfirmModal
                visible={confirm === 'leave'}
                {...copy.budgetSection.confirmLeave}
                danger
                busy={busy}
                onConfirm={leave}
                onCancel={() => setConfirm(null)}
            />
            <ConfirmModal
                visible={confirm === 'delete-all'}
                {...copy.budgetSection.confirmDeleteAll}
                danger
                busy={busy}
                onConfirm={deleteAll}
                onCancel={() => setConfirm(null)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { marginTop: theme.spacing.xl },
    heading: { ...theme.typography.heading, color: theme.colors.primaryDark, marginBottom: theme.spacing.md },
    card: { marginBottom: theme.spacing.lg },
    label: { ...theme.typography.label, color: theme.colors.textSecondary, letterSpacing: 0.6 },
    code: { fontSize: 34, fontWeight: '900', letterSpacing: 4, color: theme.colors.primaryDark, textAlign: 'center', marginVertical: theme.spacing.md },
    noCode: { ...theme.typography.heading, color: theme.colors.textMuted, textAlign: 'center', marginVertical: theme.spacing.md },
    hint: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: theme.spacing.sm },
    button: { marginTop: theme.spacing.md },
    memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing.md },
    memberDivider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
    memberText: { flex: 1, marginRight: theme.spacing.md },
    memberName: { ...theme.typography.subheading, color: theme.colors.textPrimary },
    memberUsername: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 2 },
    ownerBadge: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, borderRadius: theme.radii.pill, backgroundColor: theme.colors.mustardTint },
    ownerBadgeText: { fontSize: 12, fontWeight: '800', color: theme.colors.mustache },
    removeButton: { height: 40 },
});
