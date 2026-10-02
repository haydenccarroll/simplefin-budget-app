import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';
import { useToast } from '../Toast/Toast';
import KeyboardAwareScroll from '../ui/KeyboardAwareScroll';
import TextField from '../ui/TextField';
import Button from '../ui/Button';
import PickleHero from '../Pickle/PickleHero';
import copy from '../../copy';
import theme from '../../theme';
import { useRegisterForm, actionTypes, handleBlurValidateUsername, handleBlurValidatePassword, handleRegister } from './useRegisterForm';

export default function Register({ navigation }) {
    const { state, dispatch } = useRegisterForm();
    const showToast = useToast();
    const set = (type) => (payload) => dispatch({ type, payload });

    return (
        <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
            <KeyboardAwareScroll contentContainerStyle={styles.content}>
                <PickleHero size="small" />
                <Text style={styles.title}>{copy.register.title}</Text>
                <TextField
                    label={copy.register.firstName}
                    value={state.firstName}
                    onChangeText={set(actionTypes.setFirstName)}
                    autoCapitalize="words"
                    autoComplete="given-name"
                    textContentType="givenName"
                    returnKeyType="next"
                />
                <TextField
                    label={copy.register.lastName}
                    value={state.lastName}
                    onChangeText={set(actionTypes.setLastName)}
                    autoCapitalize="words"
                    autoComplete="family-name"
                    textContentType="familyName"
                    returnKeyType="next"
                />
                <Text style={styles.label}>{copy.register.timezone}</Text>
                <View style={styles.pickerWrap}>
                    <Picker selectedValue={state.timezone} onValueChange={set(actionTypes.setTimezone)}>
                        {Object.entries(copy.register.timezones).map(([zone, label]) => (
                            <Picker.Item key={zone} label={label} value={zone} />
                        ))}
                    </Picker>
                </View>
                <TextField
                    label={copy.register.usernameLabel}
                    placeholder={copy.register.usernamePlaceholder}
                    value={state.username}
                    onChangeText={set(actionTypes.setUsername)}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="username-new"
                    textContentType="username"
                    onBlur={() => handleBlurValidateUsername(state, dispatch)}
                    error={state.usernameError}
                />
                <TextField
                    label={copy.register.passwordLabel}
                    placeholder={copy.register.passwordPlaceholder}
                    value={state.password}
                    onChangeText={set(actionTypes.setPassword)}
                    secureTextEntry
                    autoComplete="new-password"
                    textContentType="newPassword"
                    onBlur={() => handleBlurValidatePassword(state, dispatch)}
                    error={state.passwordError}
                />
                <TextField
                    label={copy.register.passwordAgainLabel}
                    placeholder={copy.register.passwordAgainPlaceholder}
                    value={state.passwordAgain}
                    onChangeText={set(actionTypes.setPasswordAgain)}
                    secureTextEntry
                    autoComplete="new-password"
                    textContentType="newPassword"
                    returnKeyType="go"
                    onSubmitEditing={() => state.isFormValid && handleRegister(state, dispatch, navigation, showToast)}
                    onBlur={() => handleBlurValidatePassword(state, dispatch)}
                />
                {state.registerError ? <Text style={styles.error}>{state.registerError}</Text> : null}
                <Button title={copy.register.submit} onPress={() => handleRegister(state, dispatch, navigation, showToast)} disabled={!state.isFormValid} />
                <TouchableOpacity touchSoundDisabled style={styles.link} onPress={() => navigation.navigate('Login')} accessibilityRole="link">
                    <Text style={styles.linkText}>{copy.register.toLogin}</Text>
                </TouchableOpacity>
            </KeyboardAwareScroll>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    content: { flexGrow: 1, justifyContent: 'center', padding: theme.spacing.xl },
    title: { ...theme.typography.title, color: theme.colors.primaryDark, textAlign: 'center', marginBottom: theme.spacing.xl },
    label: { ...theme.typography.label, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs },
    pickerWrap: {
        borderRadius: theme.radii.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        marginBottom: theme.spacing.lg,
        overflow: 'hidden',
    },
    error: { ...theme.typography.caption, color: theme.colors.critical, marginBottom: theme.spacing.md },
    link: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: theme.spacing.md },
    linkText: { ...theme.typography.label, color: theme.colors.primaryDark, fontWeight: '700' },
});
