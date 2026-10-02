import React, { useRef } from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useToast } from '../Toast/Toast';
import KeyboardAwareScroll from '../ui/KeyboardAwareScroll';
import TextField from '../ui/TextField';
import Button from '../ui/Button';
import PickleHero from '../Pickle/PickleHero';
import copy from '../../copy';
import theme from '../../theme';
import { useLoginForm, handleLogin, actionTypes } from './useLoginForm';

export default function Login({ navigation }) {
    const { state, dispatch } = useLoginForm();
    const showToast = useToast();
    const passwordRef = useRef(null);
    const submit = () => handleLogin(state, dispatch, navigation, showToast);

    return (
        <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
            <KeyboardAwareScroll contentContainerStyle={styles.content}>
                <PickleHero />
                <TextField
                    label={copy.login.usernameLabel}
                    placeholder={copy.login.usernamePlaceholder}
                    value={state.username}
                    onChangeText={(text) => dispatch({ type: actionTypes.setUsername, payload: text })}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="username"
                    textContentType="username"
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                />
                <TextField
                    ref={passwordRef}
                    label={copy.login.passwordLabel}
                    placeholder={copy.login.passwordPlaceholder}
                    value={state.password}
                    onChangeText={(text) => dispatch({ type: actionTypes.setPassword, payload: text })}
                    secureTextEntry
                    autoComplete="current-password"
                    textContentType="password"
                    returnKeyType="go"
                    onSubmitEditing={submit}
                />
                {state.loginError ? <Text style={styles.error}>{state.loginError}</Text> : null}
                <Button title={copy.login.submit} onPress={submit} disabled={!state.isFormValid} />
                <TouchableOpacity touchSoundDisabled style={styles.link} onPress={() => navigation.navigate('Register')} accessibilityRole="link">
                    <Text style={styles.linkText}>{copy.login.toRegister}</Text>
                </TouchableOpacity>
            </KeyboardAwareScroll>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    content: { flexGrow: 1, justifyContent: 'center', padding: theme.spacing.xl },
    error: { ...theme.typography.caption, color: theme.colors.critical, marginBottom: theme.spacing.md },
    link: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: theme.spacing.md },
    linkText: { ...theme.typography.label, color: theme.colors.primaryDark, fontWeight: '700' },
});
