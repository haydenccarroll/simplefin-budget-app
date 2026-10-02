import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import apiClient from '../../api/client';
import { useToast } from '../Toast/Toast';
import Card from '../ui/Card';
import Button from '../ui/Button';
import KeyboardAwareScroll from '../ui/KeyboardAwareScroll';
import EmptyState from '../ui/EmptyState';
import ScreenHeader from '../ui/ScreenHeader';
import TextField from '../ui/TextField';
import copy from '../../copy';
import theme from '../../theme';
import { formatSignedCurrency, currentMonthKey } from '../../utils/format';

function formatSynced(iso) {
    if (!iso) return copy.linkedAccounts.neverSynced;
    return copy.linkedAccounts.lastSynced(new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
}

// The bank accounts linked under SimpleFIN. Which accounts exist, and the
// SimpleFIN token itself, are managed elsewhere (SimpleFIN and the Profile
// page), so nothing can be connected, added or removed here. Each account can
// only be given a display name (some bank names are very long) and have its
// income/expense sign flipped (some credit cards report purchases as positive).
export default function LinkedBankAccounts({ navigation }) {
    const showToast = useToast();
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [aliasDraft, setAliasDraft] = useState('');
    const [invertDraft, setInvertDraft] = useState(false);
    const [savingAccount, setSavingAccount] = useState(false);

    const load = useCallback(async () => {
        try {
            setStatus(await apiClient.getBankConnection());
        } catch (error) {
            showToast(error.message || copy.linkedAccounts.loadError);
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useFocusEffect(
        useCallback(() => {
            load();
        }, [load])
    );

    const startEditing = (account) => {
        setEditingId(account.id);
        setAliasDraft(account.alias || '');
        setInvertDraft(account.invert_amounts);
    };

    const saveAccount = async (account) => {
        setSavingAccount(true);
        try {
            const updated = await apiClient.updateBankAccount(account.id, { alias: aliasDraft.trim(), invertAmounts: invertDraft });
            setStatus((s) => ({
                ...s,
                connection: {
                    ...s.connection,
                    accounts: s.connection.accounts.map((a) => (a.id === updated.id ? updated : a)),
                },
            }));
            setEditingId(null);
            let message = copy.linkedAccounts.updated;
            if (updated.resync_needed) {
                // Flipping the sign removed this account's imported transactions; bring them back for the current month.
                try {
                    await apiClient.syncBudgetMonth(currentMonthKey());
                    message = copy.linkedAccounts.updatedAndSynced;
                } catch (syncError) {
                    message = copy.linkedAccounts.updatedSyncFailed;
                }
            }
            showToast(message, 'success');
        } catch (error) {
            showToast(error.message || copy.linkedAccounts.updateError);
        } finally {
            setSavingAccount(false);
        }
    };

    const connection = status?.connection;

    return (
        <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
            <ScreenHeader title={copy.linkedAccounts.title} onBack={() => navigation.goBack()} />
            {loading ? (
                <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: theme.spacing.xxl }} />
            ) : (
                    <KeyboardAwareScroll contentContainerStyle={styles.content}>
                        {!connection ? (
                            <>
                                <EmptyState
                                    emoji={copy.linkedAccounts.emptyEmoji}
                                    title={copy.linkedAccounts.emptyTitle}
                                    subtitle={status?.is_owner === false ? copy.linkedAccounts.emptyMember : copy.linkedAccounts.emptyOwner}
                                />
                                {status?.is_owner === false ? null : <Button title={copy.linkedAccounts.toProfile} variant="secondary" onPress={() => navigation.popTo('Profile')} />}
                            </>
                        ) : (
                            <Card>
                                <Text style={styles.sectionLabel}>{copy.linkedAccounts.sectionLabel}</Text>
                                <Text style={styles.connMeta}>{formatSynced(connection.last_synced_at)}</Text>
                                {connection.last_error ? <Text style={styles.connError}>{connection.last_error}</Text> : null}

                                {connection.accounts.length === 0 ? (
                                    <Text style={styles.noAccounts}>{copy.linkedAccounts.noAccounts}</Text>
                                ) : (
                                    connection.accounts.map((account) => (
                                        <View key={account.id} style={styles.accountBlock}>
                                            <TouchableOpacity touchSoundDisabled style={styles.accountRow} onPress={() => (editingId === account.id ? setEditingId(null) : startEditing(account))}>
                                                <View style={styles.accountInfo}>
                                                    <Text style={styles.accountName}>{account.display_name}</Text>
                                                    <Text style={styles.accountOrg} numberOfLines={1}>
                                                        {[account.org_name, account.invert_amounts ? copy.linkedAccounts.signsFlipped : null].filter(Boolean).join(' · ')}
                                                    </Text>
                                                </View>
                                                {account.balance != null && (account.currency === 'USD' || !account.currency) ? (
                                                    <Text style={styles.accountBalance}>{formatSignedCurrency(account.balance)}</Text>
                                                ) : null}
                                            </TouchableOpacity>
                                            {editingId === account.id ? (
                                                <View style={styles.editor}>
                                                    <TextField
                                                        label={copy.linkedAccounts.displayName}
                                                        placeholder={account.name}
                                                        value={aliasDraft}
                                                        onChangeText={setAliasDraft}
                                                        maxLength={100}
                                                    />
                                                    <View style={styles.switchRow}>
                                                        <View style={styles.switchText}>
                                                            <Text style={styles.switchLabel}>{copy.linkedAccounts.flipLabel}</Text>
                                                            <Text style={styles.switchHint}>{copy.linkedAccounts.flipHint}</Text>
                                                        </View>
                                                        <Switch value={invertDraft} onValueChange={setInvertDraft} trackColor={{ true: theme.colors.primary }} />
                                                    </View>
                                                    <View style={styles.editRow}>
                                                        <Button title={copy.linkedAccounts.cancel} variant="secondary" onPress={() => setEditingId(null)} disabled={savingAccount} style={styles.editButton} />
                                                        <Button title={copy.linkedAccounts.save} onPress={() => saveAccount(account)} loading={savingAccount} style={styles.editButton} />
                                                    </View>
                                                </View>
                                            ) : null}
                                        </View>
                                    ))
                                )}
                                <Text style={styles.manageNote}>{copy.linkedAccounts.manageNote}</Text>
                            </Card>
                        )}
                    </KeyboardAwareScroll>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: theme.spacing.lg },
    sectionLabel: { ...theme.typography.label, color: theme.colors.textMuted },
    connMeta: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: theme.spacing.xs },
    connError: { ...theme.typography.label, color: theme.colors.critical, marginTop: theme.spacing.sm },
    noAccounts: { ...theme.typography.body, color: theme.colors.textMuted, marginTop: theme.spacing.md },
    accountBlock: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
    accountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: theme.spacing.md,
    },
    accountInfo: { flex: 1, marginRight: theme.spacing.md },
    accountName: { ...theme.typography.subheading, color: theme.colors.textPrimary },
    accountOrg: { ...theme.typography.caption, color: theme.colors.textMuted },
    accountBalance: { ...theme.typography.subheading, color: theme.colors.textSecondary },
    editor: { paddingBottom: theme.spacing.md },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.sm },
    switchText: { flex: 1, marginRight: theme.spacing.md },
    switchLabel: { ...theme.typography.subheading, color: theme.colors.textPrimary },
    switchHint: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 2 },
    editRow: { flexDirection: 'row', marginTop: theme.spacing.sm },
    editButton: { flex: 1, marginHorizontal: theme.spacing.xs },
    manageNote: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: theme.spacing.md },
});
