import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import apiClient from '../../api/client';
import { useToast } from '../Toast/Toast';
import Card from '../ui/Card';
import Button from '../ui/Button';
import TextField from '../ui/TextField';
import KeyboardAwareScroll from '../ui/KeyboardAwareScroll';
import PickleHero from '../Pickle/PickleHero';
import copy from '../../copy';
import theme from '../../theme';
import { showFunPopup } from '../../utils/fun';

// Where everyone lands after signing up (and anyone who isn't in a budget, e.g.
// after being removed from theirs): start a budget of their own and be its
// owner, or join someone else's with their friend code.
export default function Onboarding({ navigation }) {
    const showToast = useToast();
    const [friendCode, setFriendCode] = useState('');
    const [creating, setCreating] = useState(false);
    const [joining, setJoining] = useState(false);

    // Someone who already has a budget has no business here.
    useEffect(() => {
        apiClient.getBudget().then(() => navigation.replace('Home')).catch(() => {});
    }, []);

    const enter = (kind) => {
        showFunPopup(kind);
        navigation.replace('Home');
    };

    const create = async () => {
        setCreating(true);
        try {
            await apiClient.createBudget();
            enter('budgetCreated');
        } catch (error) {
            if (error.status === 409) {
                navigation.replace('Home');
                return;
            }
            showToast(error.message || copy.onboarding.createError);
            setCreating(false);
        }
    };

    const join = async () => {
        setJoining(true);
        try {
            await apiClient.joinBudget(friendCode);
            enter('budgetJoined');
        } catch (error) {
            if (error.status === 409) {
                navigation.replace('Home');
                return;
            }
            showToast(error.message || copy.onboarding.joinError);
            setJoining(false);
        }
    };

    const logout = async () => {
        try {
            await apiClient.logout();
        } catch (error) {
            // The session on this device is gone either way.
        }
        navigation.replace('Login');
    };

    return (
        <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
                <KeyboardAwareScroll contentContainerStyle={styles.content}>
                    <PickleHero size="small" />
                    <Text style={styles.title}>{copy.onboarding.title}</Text>

                    <Card style={styles.card}>
                        <Text style={styles.cardTitle}>{copy.onboarding.createTitle}</Text>
                        <Text style={styles.cardBody}>{copy.onboarding.createBody}</Text>
                        <Button title={copy.onboarding.createButton} onPress={create} loading={creating} disabled={joining} style={styles.button} />
                    </Card>

                    <Text style={styles.or}>{copy.onboarding.or}</Text>

                    <Card style={styles.card}>
                        <Text style={styles.cardTitle}>{copy.onboarding.joinTitle}</Text>
                        <Text style={styles.cardBody}>{copy.onboarding.joinBody}</Text>
                        <TextField
                            placeholder={copy.onboarding.joinPlaceholder}
                            value={friendCode}
                            onChangeText={setFriendCode}
                            autoCapitalize="characters"
                            autoCorrect={false}
                            maxLength={12}
                            style={styles.field}
                        />
                        <Button
                            title={copy.onboarding.joinButton}
                            onPress={join}
                            loading={joining}
                            disabled={creating || friendCode.trim().length < 8}
                            style={styles.button}
                        />
                    </Card>

                    <View style={styles.footer}>
                        <Button title={copy.onboarding.logout} variant="ghost" onPress={logout} disabled={creating || joining} />
                    </View>
                </KeyboardAwareScroll>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
    title: { ...theme.typography.title, color: theme.colors.primaryDark, textAlign: 'center' },
    card: { alignItems: 'stretch' },
    cardTitle: { ...theme.typography.heading, color: theme.colors.textPrimary },
    cardBody: { ...theme.typography.body, color: theme.colors.textSecondary, marginTop: theme.spacing.sm },
    field: { marginTop: theme.spacing.lg, marginBottom: 0 },
    button: { marginTop: theme.spacing.lg },
    or: { ...theme.typography.subheading, color: theme.colors.textMuted, textAlign: 'center', marginVertical: theme.spacing.lg },
    footer: { marginTop: theme.spacing.xl },
});
