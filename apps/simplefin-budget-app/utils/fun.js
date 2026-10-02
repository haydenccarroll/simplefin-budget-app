// The popup that appears after saving or deleting something: a tiny event bus, so a form
// can fire a celebration popup and then navigate away; the popup host at the app root
// keeps showing it over whatever screen comes next. What the popups say lives in copy/index.js.
import copy from '../copy';

export const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Deleting gets a mustard-colored popup instead of a green one.
const OOPS_KINDS = new Set(['expenseDeleted', 'incomeDeleted', 'categoryDeleted', 'memberRemoved', 'dataDeleted', 'friendCodeDeleted', 'entriesRejected']);

const listeners = new Set();

// `amount` only matters for new expenses, where a big one earns a joke.
export function showFunPopup(kind, { amount = 0 } = {}) {
    const big = kind === 'expenseAdded' ? copy.bigSpend.find((tier) => amount >= tier.min) : null;
    const phrase = pick(big ? big.jokes : copy.popups[kind]);
    const popup = {
        ...phrase,
        tone: big || OOPS_KINDS.has(kind) ? 'oops' : 'good',
        mood: big ? 'worried' : 'tickled',
        character: pick(['bill', 'dill']),
    };
    listeners.forEach((listener) => listener(popup));
}

export function subscribeFunPopup(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
