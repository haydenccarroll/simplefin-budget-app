import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Pickle from './Pickle';
import theme from '../../theme';

const ITEMS = [
    { character: 'bill', height: 170, left: -22, top: '14%', rotate: '-16deg', facing: 'right' },
    { character: 'dill', height: 190, right: -26, top: '30%', rotate: '14deg', facing: 'left' },
    { character: 'bill', height: 150, right: -12, top: '62%', rotate: '20deg', facing: 'left' },
    { character: 'dill', height: 160, left: -18, top: '68%', rotate: '-12deg', facing: 'right' },
];

const EGGS = [
    { left: '38%', top: '20%', size: 30, rotate: '12deg' },
    { right: '30%', top: '52%', size: 26, rotate: '-20deg' },
    { left: '44%', top: '80%', size: 32, rotate: '18deg' },
];

// Faint pickles and eggs loafing around behind the content. Purely decorative.
export default function PickleBackdrop() {
    return (
        <View style={styles.fill}>
            {ITEMS.map(({ rotate, ...item }, i) => (
                <View key={i} style={[styles.item, { top: item.top, left: item.left, right: item.right, transform: [{ rotate }] }]}>
                    <Pickle character={item.character} height={item.height} facing={item.facing} />
                </View>
            ))}
            {EGGS.map(({ size, rotate, ...pos }, i) => (
                <Text key={i} style={[styles.egg, pos, { fontSize: size, transform: [{ rotate }] }]}>🥚</Text>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    fill: { ...theme.absoluteFill, opacity: 0.2, overflow: 'hidden', pointerEvents: 'none' },
    item: { position: 'absolute' },
    egg: { position: 'absolute' },
});
