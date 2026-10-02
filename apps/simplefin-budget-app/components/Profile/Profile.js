import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';
import apiClient from '../../api/client';
import { useToast } from '../Toast/Toast';
import KeyboardAwareScroll from '../ui/KeyboardAwareScroll';
import ScreenHeader from '../ui/ScreenHeader';
import TextField from '../ui/TextField';
import BudgetSection from './BudgetSection';
import Button from '../ui/Button';
import copy from '../../copy';
import theme from '../../theme';
import { TIMEZONES } from '../../utils/timezones';
import { resetRootTo } from '../../utils/rootNav';

const EDGES = ['top', 'left', 'right'];

// Your account (name, username, timezone; the password has its own screen) and the budget's bank link both go to the
// budget API. The bank link belongs to the budget, not the person: the owner pastes a
// SimpleFIN setup token, which the API claims immediately.
export default function Profile({ navigation }) {
    const showToast = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [initial, setInitial] = useState(null);
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [username, setUsername] = useState('');
    const [timezone, setTimezone] = useState('America/Denver');
    const [currentPassword, setCurrentPassword] = useState('');
    const [simplefinToken, setSimplefinToken] = useState('');
    const [bankConnected, setBankConnected] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);
    // The budget this person is in; null until loaded. Only its owner links the bank.
    const [budget, setBudget] = useState(null);

    const applyUser = (user) => {
        const values = {
            firstName: user.first_name || '',
            lastName: user.last_name || '',
            username: user.username || '',
            timezone: user.timezone || 'America/Denver',
        };
        setInitial(values);
        setFirstName(values.firstName);
        setLastName(values.lastName);
        setUsername(values.username);
        setTimezone(values.timezone);
    };

    useEffect(() => {
        const load = async () => {
            try {
                applyUser(await apiClient.getMe());
                try {
                    const loaded = await apiClient.getBudget();
                    setBudget(loaded);
                    if (loaded.is_owner) {
                        setBankConnected(Boolean((await apiClient.getBankConnection()).connection));
                    }
                } catch (budgetError) {
                    // Not in a budget: the app redirects to the create-or-join screen.
                }
            } catch (error) {
                // A 401 has already sent the person to sign in again.
                showToast(error.status ? copy.profile.loadError : copy.profile.loadNetworkError);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const reloadBudget = async () => setBudget(await apiClient.getBudget());

    const dirty = initial !== null && (
        firstName !== initial.firstName ||
        lastName !== initial.lastName ||
        username !== initial.username ||
        timezone !== initial.timezone
    );

    const usernameChanged = initial !== null && username.trim().toLowerCase() !== initial.username;

    const tokenEntered = simplefinToken.trim() !== '';

    // One button saves everything on the page: the profile if it changed, and the SimpleFIN
    // token if one was pasted.
    const save = async () => {
        if (!username.trim()) {
            showToast(copy.profile.needsUsername);
            return;
        }
        if (dirty && usernameChanged && !currentPassword) {
            showToast(copy.profile.needsPasswordForUsername);
            return;
        }
        setSaving(true);
        let profileSaved = false;
        try {
            if (dirty) {
                const user = await apiClient.updateProfile({
                    firstName: firstName.trim(),
                    lastName: lastName.trim(),
                    username: username.trim(),
                    timezone,
                    currentPassword: usernameChanged ? currentPassword : undefined,
                });
                applyUser(user);
                setCurrentPassword('');
                profileSaved = true;
            }
            if (tokenEntered && budget?.is_owner) {
                const status = await apiClient.connectBank(simplefinToken.trim());
                setBankConnected(Boolean(status.connection));
                setSimplefinToken('');
            }
            showToast(tokenEntered ? copy.profile.savedWithBank : copy.profile.saved, 'success');
        } catch (error) {
            const message = error.status ? error.message : copy.common.networkError;
            // If the profile went through but the token didn't, say so.
            showToast(profileSaved ? copy.profile.savedButBankFailed(message) : message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const disconnectBank = async () => {
        setDisconnecting(true);
        try {
            await apiClient.disconnectBank();
            setBankConnected(false);
            showToast(copy.profile.disconnected, 'success');
        } catch (error) {
            showToast(error.message || copy.profile.disconnectError, 'error');
        } finally {
            setDisconnecting(false);
        }
    };

    const logout = async () => {
        try {
            await apiClient.logout();
        } catch (error) {
            // The session on this device is gone either way.
        }
        resetRootTo(navigation, 'Login');
    };

    const timezoneOptions = TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES];

    return (
        <SafeAreaView edges={EDGES} style={styles.container}>
            <ScreenHeader title={copy.profile.title} onBack={() => navigation.goBack()} />
            {loading ? (
                <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: theme.spacing.xxl }} />
            ) : (
                    <KeyboardAwareScroll contentContainerStyle={styles.content}>
                        <TextField label={copy.profile.firstName} value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
                        <TextField label={copy.profile.lastName} value={lastName} onChangeText={setLastName} autoCapitalize="words" />
                        <TextField
                            label={copy.profile.username}
                            value={username}
                            onChangeText={setUsername}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />

                        <Text style={styles.label}>{copy.profile.timezone}</Text>
                        <View style={styles.pickerWrap}>
                            <Picker selectedValue={timezone} onValueChange={setTimezone}>
                                {timezoneOptions.map((tz) => (
                                    <Picker.Item key={tz} label={tz.replace(/_/g, ' ')} value={tz} />
                                ))}
                            </Picker>
                        </View>

                        {usernameChanged ? (
                            <TextField
                                label={copy.profile.currentPassword}
                                value={currentPassword}
                                onChangeText={setCurrentPassword}
                                autoCapitalize="none"
                                autoCorrect={false}
                                secureTextEntry
                            />
                        ) : null}

                        {budget?.is_owner ? (
                            <>
                                <TextField
                                    label={bankConnected ? copy.profile.simplefinReplaceLabel : copy.profile.simplefinLabel}
                                    placeholder={copy.profile.simplefinPlaceholder}
                                    value={simplefinToken}
                                    onChangeText={setSimplefinToken}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    secureTextEntry
                                />
                                <Text style={styles.hint}>{copy.profile.simplefinOwnerHint(bankConnected)}</Text>
                            </>
                        ) : budget ? (
                            <Text style={styles.hint}>{copy.profile.simplefinMemberHint}</Text>
                        ) : null}

                        <Button title={copy.profile.save} onPress={save} loading={saving} disabled={!dirty && !(tokenEntered && budget?.is_owner)} style={styles.save} />
                        {budget?.is_owner && bankConnected ? (
                            <Button title={copy.profile.disconnect} variant="ghost" onPress={disconnectBank} disabled={disconnecting || saving} style={styles.action} />
                        ) : null}
                        <Button
                            title={copy.profile.linkedAccounts}
                            variant="secondary"
                            onPress={() => navigation.navigate('LinkedBankAccounts')}
                            style={styles.action}
                        />
                        <Button title={copy.profile.changePassword} variant="secondary" onPress={() => navigation.navigate('ChangePassword')} style={styles.action} />
                        <BudgetSection budget={budget} onChanged={reloadBudget} navigation={navigation} showToast={showToast} />
                        <Button title={copy.profile.logout} variant="ghost" onPress={logout} style={styles.action} />
                    </KeyboardAwareScroll>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl + 40 },
    label: {
        ...theme.typography.label,
        color: theme.colors.textSecondary,
        marginBottom: theme.spacing.xs,
    },
    pickerWrap: {
        borderRadius: theme.radii.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        marginBottom: theme.spacing.lg,
    },
    hint: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: -theme.spacing.sm, marginBottom: theme.spacing.lg },
    save: { marginTop: theme.spacing.sm },
    action: { marginTop: theme.spacing.md },
});
