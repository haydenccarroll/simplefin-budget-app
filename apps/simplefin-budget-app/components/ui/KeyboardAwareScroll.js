import React from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import theme from '../../theme';

// A scrolling screen body. The page resizes itself above the on-screen keyboard (see
// index.html), so it is just a ScrollView with taps on buttons still registering while the
// keyboard is open.
//
// `footer` (usually the Save button) stays pinned under the scrolling content, so it is
// reachable however long the form gets and rides above the keyboard.
export default function KeyboardAwareScroll({ children, footer, ...scrollProps }) {
    return (
        <View style={{ flex: 1 }}>
            <ScrollView
                keyboardShouldPersistTaps="handled"
                style={{ flex: 1 }}
                {...scrollProps}
            >
                {children}
            </ScrollView>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    footer: {
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.md,
        paddingBottom: theme.spacing.md,
        backgroundColor: theme.colors.background,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
    },
});
