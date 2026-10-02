import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, ScrollView, StyleSheet } from 'react-native';
import Pickle from '../Pickle/Pickle';
import Button from './Button';
import copy from '../../copy';
import theme from '../../theme';
import { hapticWarning } from '../../utils/haptics';
import useVisibleHeight from '../../utils/useVisibleHeight';

// A confirmation dialog for things that can't be undone. Its buttons say plainly what
// they do (Confirm / Cancel unless a caller gives a specific verb). (Alert.alert doesn't
// exist on web, and this can hold Bill's worried face.) With `requireText`, the
// confirm button stays disabled until that word has been typed.
export default function ConfirmModal({
    visible,
    title,
    message,
    confirmLabel = copy.common.confirm,
    cancelLabel = copy.common.cancel,
    danger = false,
    requireText,
    busy = false,
    onConfirm,
    onCancel,
}) {
    const [typed, setTyped] = useState('');
    // Sized to the space above the on-screen keyboard, and scrollable when the card is taller than it.
    const visibleHeight = useVisibleHeight(visible);

    useEffect(() => {
        if (!visible) setTyped('');
    }, [visible]);

    const unlocked = !requireText || typed.trim().toLowerCase() === requireText.toLowerCase();

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
            <View style={[styles.backdrop, visibleHeight ? { height: visibleHeight } : styles.backdropFull]} accessibilityViewIsModal>
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.card}>
                    <Pickle character="bill" height={72} mood="worried" />
                    <Text style={styles.title}>{title}</Text>
                    {message ? <Text style={styles.message}>{message}</Text> : null}
                    {requireText ? (
                        <>
                            <Text style={styles.prompt}>{copy.confirmModal.prompt(requireText)}</Text>
                            <TextInput
                                style={styles.input}
                                value={typed}
                                onChangeText={setTyped}
                                autoCapitalize="characters"
                                autoCorrect={false}
                                placeholder={requireText}
                                placeholderTextColor={theme.colors.textMuted}
                                onFocus={(e) => e.target?.scrollIntoView?.({ block: 'center' })}
                            />
                        </>
                    ) : null}
                    <Button
                        title={confirmLabel}
                        variant={danger ? 'danger' : 'primary'}
                        onPress={() => {
                            if (danger) hapticWarning();
                            onConfirm();
                        }}
                        disabled={!unlocked}
                        loading={busy}
                        style={styles.button}
                    />
                    <Button title={cancelLabel} variant="secondary" onPress={onCancel} disabled={busy} style={styles.button} />
                </View>
              </ScrollView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdropFull: { flex: 1 },
    backdrop: {
        backgroundColor: 'rgba(11, 11, 11, 0.55)',
    },
    scroll: { flex: 1 },
    scrollContent: {
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: theme.spacing.xl,
    },
    card: {
        width: '100%',
        maxWidth: 420,
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        borderWidth: 3,
        borderColor: theme.colors.mustard,
        padding: theme.spacing.xl,
    },
    title: { ...theme.typography.heading, color: theme.colors.mustache, textAlign: 'center', marginTop: theme.spacing.md },
    message: { ...theme.typography.body, color: theme.colors.textSecondary, textAlign: 'center', marginTop: theme.spacing.sm },
    prompt: { ...theme.typography.label, color: theme.colors.textSecondary, marginTop: theme.spacing.lg },
    input: {
        width: '100%',
        height: 48,
        marginTop: theme.spacing.sm,
        borderRadius: theme.radii.md,
        borderWidth: 2,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.background,
        paddingHorizontal: theme.spacing.md,
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: 2,
        textAlign: 'center',
        color: theme.colors.textPrimary,
    },
    button: { width: '100%', marginTop: theme.spacing.md },
});
