import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import PickleBuddy from '../Pickle/PickleBuddy';
import HugHearts from '../Pickle/HugHearts';
import { artWidth } from '../Pickle/art';
import copy from '../../copy';
import theme from '../../theme';
import { formatMonthLabel } from '../../utils/format';

export const BANNER_PICKLE_HEIGHT = 84;
export const BANNER_PICKLE_WIDTH = artWidth('bill', BANNER_PICKLE_HEIGHT);
const NAP_AFTER_MS = 12000;

// Bill and Dill either side of the month's name (tap it to pick another month), worrying out
// loud when the budget needs work. Tapping a pickle tickles it. The parent drives them through
// the refs (hugs, tickles, speech) and the `hugging` flag.
export default function HomeBanner({ billRef, dillRef, mood, hugging, worryMessage, monthKey, onPickMonth, onWidth }) {
    return (
        <View style={styles.banner} onLayout={(event) => onWidth(event.nativeEvent.layout.width)}>
            <PickleBuddy ref={billRef} character="bill" height={BANNER_PICKLE_HEIGHT} facing="right" mood={mood} moveDir={1} bubbleAlign="start" tickleOnPress sleepAfterMs={NAP_AFTER_MS} />
            <View style={[styles.title, hugging && { opacity: 0 }]}>
                <TouchableOpacity
                    touchSoundDisabled
                    onPress={onPickMonth}
                    style={styles.monthButton}
                    accessibilityRole="button"
                    accessibilityLabel={copy.months.pick(formatMonthLabel(monthKey))}
                >
                    <Text style={styles.month} numberOfLines={2} adjustsFontSizeToFit>{formatMonthLabel(monthKey)} ▾</Text>
                </TouchableOpacity>
                {worryMessage ? <Text style={styles.worry} numberOfLines={1}>{worryMessage}</Text> : null}
            </View>
            <PickleBuddy ref={dillRef} character="dill" height={BANNER_PICKLE_HEIGHT} facing="left" mood={mood} moveDir={-1} bubbleAlign="end" tickleOnPress sleepAfterMs={NAP_AFTER_MS} />
            <HugHearts visible={hugging} />
        </View>
    );
}

const styles = StyleSheet.create({
    // zIndex keeps the tickle speech bubbles above the content underneath.
    banner: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.sm,
        paddingBottom: theme.spacing.sm,
        backgroundColor: theme.colors.primaryTint,
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28,
        borderBottomWidth: 3,
        borderBottomColor: theme.colors.primary,
        zIndex: 10,
        elevation: 10,
    },
    title: { flex: 1, alignItems: 'center', paddingHorizontal: theme.spacing.sm, paddingBottom: theme.spacing.md },
    monthButton: { minHeight: 44, justifyContent: 'center' },
    month: { fontSize: 26, fontWeight: '900', color: theme.colors.primaryDark, textAlign: 'center' },
    worry: { fontSize: 12, fontWeight: '800', color: theme.colors.critical, textAlign: 'center', marginTop: 2 },
});
