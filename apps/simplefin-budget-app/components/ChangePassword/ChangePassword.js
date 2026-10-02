import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import apiClient from '../../api/client';
import { useToast } from '../Toast/Toast';
import KeyboardAwareScroll from '../ui/KeyboardAwareScroll';
import ScreenHeader from '../ui/ScreenHeader';
import TextField from '../ui/TextField';
import Button from '../ui/Button';
import copy from '../../copy';
import theme from '../../theme';

export default function ChangePassword({ navigation }) {
    const showToast = useToast();
    const [current, setCurrent] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newPasswordAgain, setNewPasswordAgain] = useState('');
    const [saving, setSaving] = useState(false);

    const ready = current !== '' && newPassword.length >= 8 && newPassword === newPasswordAgain;

    const save = async () => {
        setSaving(true);
        try {
            await apiClient.changePassword(current, newPassword);
            setCurrent('');
            setNewPassword('');
            setNewPasswordAgain('');
            showToast(copy.changePassword.saved, 'success');
        } catch (error) {
            showToast(error.status ? error.message : copy.common.networkError);
        } finally {
            setSaving(false);
        }
    };

    return (
        <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
            <ScreenHeader title={copy.changePassword.title} onBack={() => navigation.goBack()} />
            <KeyboardAwareScroll
                contentContainerStyle={styles.content}
                footer={<Button title={copy.common.save} onPress={save} loading={saving} disabled={!ready} />}
            >
                <TextField label={copy.changePassword.current} value={current} onChangeText={setCurrent} autoCapitalize="none" autoCorrect={false} secureTextEntry />
                <TextField label={copy.changePassword.new} value={newPassword} onChangeText={setNewPassword} autoCapitalize="none" autoCorrect={false} secureTextEntry />
                <TextField label={copy.changePassword.newAgain} value={newPasswordAgain} onChangeText={setNewPasswordAgain} autoCapitalize="none" autoCorrect={false} secureTextEntry />
            </KeyboardAwareScroll>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: theme.spacing.lg },
});
