// Entries (expenses and income items) made while the API can't be reached are kept on the
// device and sent later. Each carries a random client id, which the API uses to ignore a
// repeat of an entry it already saved (the connection can drop after the API saved one but
// before the app heard back), so sending is safe to retry.
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../api/client';
import { showFunPopup } from './fun';

const STORAGE_KEY = 'pending_entries';
const RETRY_EVERY_MS = 30000;

// { owner: user id, entries: [{ clientId, kind: 'expense' | 'income', month, payload, display }] }.
// Entries belong to whoever made them: another person signing in on this device never sends them.
let state = null;
let flushing = false;
const listeners = new Set();

export function newClientId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.floor(Math.random() * 16);
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

async function load() {
    if (!state) {
        try {
            state = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) || 'null');
        } catch (error) {
            state = null;
        }
        if (!state || !Array.isArray(state.entries)) state = { owner: null, entries: [] };
    }
    return state;
}

async function save() {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    listeners.forEach((listener) => listener(state.entries));
}

// Calls listener with the pending entries whenever they change. Returns an unsubscribe function.
export function subscribePending(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export async function listPending(month) {
    const { entries } = await load();
    return month ? entries.filter((entry) => entry.month === month) : entries;
}

// payload is what createExpense / createIncomeItem take (without the clientId); display
// holds what the pending list needs to show it (e.g. the category's name).
export async function enqueue({ kind, month, clientId, payload, display = {} }) {
    await load();
    if (!state.entries.some((entry) => entry.clientId === clientId)) {
        state.entries.push({ kind, month, clientId, payload, display, queuedAt: Date.now() });
    }
    await save();
}

async function claimFor(user) {
    await load();
    if (state.owner && state.owner !== user.id) state.entries = [];
    state.owner = user.id;
    await save();
}

async function send(entry) {
    const create = () => (entry.kind === 'expense'
        ? apiClient.createExpense(entry.month, { ...entry.payload, clientId: entry.clientId })
        : apiClient.createIncomeItem(entry.month, { ...entry.payload, clientId: entry.clientId }));
    try {
        await create();
    } catch (error) {
        if (error.status !== 404) throw error;
        if (/category/i.test(error.message)) {
            // The jar was deleted while this was waiting; keep the entry, just not in a jar.
            entry.payload = { ...entry.payload, categoryGroupId: null };
            await create();
        } else {
            // The month wasn't started yet (it was only ever on this phone).
            await apiClient.startBudgetMonth(entry.month);
            await create();
        }
    }
}

// Sends what's waiting, oldest first, and stops at the first sign the connection or the
// session is down. Entries the API rejects for good (say, a bad amount) are dropped so
// they can't block the ones behind them.
export async function syncPending() {
    if (flushing) return;
    flushing = true;
    try {
        await load();
        if (!state.entries.length) return;
        if (!state.owner) {
            try {
                state.owner = (await apiClient.getMe()).id;
            } catch (error) {
                return;
            }
        }
        let synced = 0;
        let dropped = 0;
        for (const entry of [...state.entries]) {
            try {
                await send(entry);
                synced++;
            } catch (error) {
                const retryLater = error.isNetworkError || error.status === 401 || error.status === 429 ||
                    error.status >= 500 || error.code === 'no_budget';
                if (retryLater) break;
                if (error.status !== 409) dropped++; // 409: it was already saved
            }
            state.entries = state.entries.filter((e) => e.clientId !== entry.clientId);
            await save();
        }
        if (synced > 0) showFunPopup('entriesSynced');
        if (dropped > 0) showFunPopup('entriesRejected');
    } finally {
        flushing = false;
    }
}

// Starts trying to send pending entries: now, whenever the app comes back to the
// foreground, and every so often while any are waiting. Returns a function that stops it.
export function startOfflineSync() {
    apiClient.setSignedInHandler((user) => { claimFor(user).then(syncPending).catch(() => {}); });
    const appState = AppState.addEventListener('change', (next) => {
        if (next === 'active') syncPending();
    });
    const timer = setInterval(syncPending, RETRY_EVERY_MS);
    syncPending();
    return () => {
        apiClient.setSignedInHandler(null);
        appState.remove();
        clearInterval(timer);
    };
}
