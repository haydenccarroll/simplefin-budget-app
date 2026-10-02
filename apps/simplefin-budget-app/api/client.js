import AsyncStorage from '@react-native-async-storage/async-storage';
import copy from '../copy';

const BUDGET_API_HOST = import.meta.env.VITE_BUDGET_API_HOST;

// The API sets an HttpOnly session cookie that scripts can't read, so there is no token to
// keep: every request just says credentials: 'include'.

// How long to wait on the API before treating the connection as down.
const REQUEST_TIMEOUT_MS = 20000;
const SLOW_REQUEST_TIMEOUT_MS = 120000; // bank syncs and the full export
const MONTH_CACHE_PREFIX = 'month_cache_';

class ApiClient {
    constructor() {
        this.onNoBudget = null;
        this.onSignedOut = null;
        this.onSignedIn = null;
    }

    // Called with the user whenever someone signs in or registers on this device.
    setSignedInHandler(handler) {
        this.onSignedIn = handler;
    }

    // Called (once per failed request) when the API says the signed-in user isn't in a
    // budget, e.g. they were removed from theirs. The app uses it to send them to the
    // create-or-join screen from wherever they are.
    setNoBudgetHandler(handler) {
        this.onNoBudget = handler;
    }

    // Called when the API says the session is over (expired, or signed out elsewhere, e.g. by
    // a password change), so the app can send the person to sign in again.
    setSignedOutHandler(handler) {
        this.onSignedOut = handler;
    }

    async hasValidSession() {
        try {
            await this.getMe();
            return true;
        } catch (error) {
            return false;
        }
    }

    // Accounts. Each of these rejects with an Error whose message is the API's own (safe to
    // show), plus .status.

    _startSession(session) {
        this.onSignedIn?.(session.user);
        return session.user;
    }

    async login(username, password) {
        const session = await this._authedFetch('/v1/auth/login', {
            method: 'POST',
            public: true,
            body: JSON.stringify({ username, password })
        });
        return this._startSession(session);
    }

    async register({ username, password, firstName, lastName, timezone }) {
        const session = await this._authedFetch('/v1/auth/register', {
            method: 'POST',
            public: true,
            body: JSON.stringify({ username, password, first_name: firstName, last_name: lastName, timezone })
        });
        return this._startSession(session);
    }

    // Always ends the session on this device, even if the API can't be reached.
    async logout() {
        try {
            await this._authedFetch('/v1/auth/logout', { method: 'POST', public: true });
        } finally {
            this.clearSession();
        }
    }

    // Returns { id, username, first_name, last_name, timezone }.
    getMe() {
        return this._authedFetch('/v1/auth/me');
    }

    // Changes name, username and/or timezone. Changing the username needs currentPassword. Returns the user.
    updateProfile({ firstName, lastName, username, timezone, currentPassword }) {
        return this._authedFetch('/v1/auth/me', {
            method: 'PATCH',
            body: JSON.stringify({
                first_name: firstName,
                last_name: lastName,
                username,
                timezone,
                current_password: currentPassword || undefined
            })
        });
    }

    // Signs every other device out; this one stays signed in.
    changePassword(currentPassword, newPassword) {
        return this._authedFetch('/v1/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
        });
    }

    // Budget API endpoints

    // Sends a request and returns the raw response, throwing an Error (with .status and, when
    // the API gave one, .code) for anything but a 2xx. Signed in by cookie. Pass public: true for the sign-in and password-reset calls, where
    // a 401 just means "wrong password" rather than "your session is over".
    async _authedRequest(path, { public: isPublic = false, headers = {}, timeoutMs = REQUEST_TIMEOUT_MS, ...options } = {}) {
        // fetch only rejects when the request never got an answer (no connection, a timeout),
        // so that is what .isNetworkError means: the caller can keep the work and try later.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let response;
        try {
            response = await fetch(`${BUDGET_API_HOST}${path}`, {
                ...options,
                signal: controller.signal,
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                }
            });
        } catch (cause) {
            const offline = new Error(copy.api.offline);
            offline.isNetworkError = true;
            throw offline;
        } finally {
            clearTimeout(timer);
        }
        if (!response.ok) {
            let message = `Request failed (${response.status})`;
            let code;
            try {
                const body = await response.json();
                if (body?.error) message = body.error;
                code = body?.code;
            } catch (e) {
                // ignore non-JSON error bodies
            }
            const error = new Error(message);
            error.status = response.status;
            error.code = code;
            if (response.status === 401 && !isPublic) {
                this.clearSession();
                this.onSignedOut?.();
            }
            if (response.status === 403 && code === 'no_budget') this.onNoBudget?.();
            throw error;
        }
        return response;
    }

    async _authedFetch(path, options = {}) {
        const response = await this._authedRequest(path, options);
        if (response.status === 204) return null;
        return response.json();
    }

    // Budgets: a budget has one owner and any number of members who join with its
    // friend code. Everyone is in at most one; the data endpoints below answer 403
    // with code 'no_budget' until they've created or joined one.

    // friend_code is null while joining is switched off.
    // Returns { id, friend_code, is_owner, members: [{ user_id, first_name, last_name,
    // username, is_owner, is_you, joined_at }] }.
    getBudget() {
        return this._authedFetch('/v1/budget');
    }

    createBudget() {
        return this._authedFetch('/v1/budget', { method: 'POST' });
    }

    joinBudget(friendCode) {
        return this._authedFetch('/v1/budget/join', { method: 'POST', body: JSON.stringify({ friend_code: friendCode }) });
    }

    // Owner only: generates a friend code, or replaces the current one (so the old one
    // stops working). Returns the budget.
    rotateFriendCode() {
        return this._authedFetch('/v1/budget/friend-code', { method: 'POST' });
    }

    // Owner only: deletes the friend code so nobody can join until a new one is generated.
    // Returns the budget.
    disableFriendCode() {
        return this._authedFetch('/v1/budget/friend-code', { method: 'DELETE' });
    }

    // The owner can remove anyone else; a member can remove only themselves (leave).
    removeBudgetMember(userId) {
        return this._authedFetch(`/v1/budget/members/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    }

    // Owner only: permanently deletes the whole budget (every month, income, category and
    // expense, the bank link, the friend code and everyone's membership). Everyone in it,
    // the owner included, is left with no budget and can create or join another.
    deleteAllBudgetData() {
        return this._authedFetch('/v1/budget/data', { method: 'DELETE' });
    }

    // Returns { csv, filename } for the whole budget: every month that has records.
    async exportBudgetCsv() {
        const response = await this._authedRequest('/v1/budget/export', { timeoutMs: SLOW_REQUEST_TIMEOUT_MS });
        const disposition = response.headers.get('Content-Disposition') || '';
        const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] || 'budget.csv';
        return { csv: await response.text(), filename };
    }

    // The last month the API sent is kept on the device, so with no connection the screen
    // (and the jar picker when adding an entry) still has something to show. A copy from
    // the cache comes back with offline: true.
    async getBudgetMonth(month) {
        try {
            const data = await this._authedFetch(`/v1/budget-month/${month}`);
            AsyncStorage.setItem(MONTH_CACHE_PREFIX + month, JSON.stringify(data)).catch(() => {});
            return data;
        } catch (error) {
            if (!error.isNetworkError) throw error;
            const cached = await AsyncStorage.getItem(MONTH_CACHE_PREFIX + month).catch(() => null);
            if (!cached) throw error;
            return { ...JSON.parse(cached), offline: true };
        }
    }

    startBudgetMonth(month) {
        return this._authedFetch(`/v1/budget-month/${month}/start`, { method: 'POST' });
    }

    listBudgetMonths() {
        return this._authedFetch('/v1/budget-months');
    }

    // clientId (a UUID) lets the API ignore a repeat of an entry it already saved.
    createIncomeItem(month, { name, plannedAmount, receivedAt, clientId }) {
        return this._authedFetch(`/v1/budget-month/${month}/income-item`, {
            method: 'POST',
            body: JSON.stringify({ name, planned_amount: plannedAmount, received_at: receivedAt, client_id: clientId })
        });
    }

    updateIncomeItem(id, { name, plannedAmount, receivedAt, sortOrder }) {
        return this._authedFetch(`/v1/income-item/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                name,
                planned_amount: plannedAmount,
                received_at: receivedAt,
                sort_order: sortOrder ?? 0
            })
        });
    }

    deleteIncomeItem(id) {
        return this._authedFetch(`/v1/income-item/${id}`, { method: 'DELETE' });
    }

    // description says what belongs in the category; the model that automatically
    // categorizes expenses reads it.
    createCategoryGroup(month, { name, plannedAmount, description }) {
        return this._authedFetch(`/v1/budget-month/${month}/category-group`, {
            method: 'POST',
            body: JSON.stringify({ name, planned_amount: plannedAmount, description: description || null })
        });
    }

    updateCategoryGroup(id, { name, plannedAmount, sortOrder, description }) {
        return this._authedFetch(`/v1/category-group/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ name, planned_amount: plannedAmount, sort_order: sortOrder ?? 0, description: description || null })
        });
    }

    deleteCategoryGroup(id) {
        return this._authedFetch(`/v1/category-group/${id}`, { method: 'DELETE' });
    }

    listExpenses(month, page = 1, pageSize = 50) {
        return this._authedFetch(`/v1/budget-month/${month}/expenses?page=${page}&page_size=${pageSize}`);
    }

    // Every expense in the month. The API caps a page at 100, so this walks the pages.
    async listAllExpenses(month) {
        const all = [];
        for (let page = 1; ; page++) {
            const result = await this.listExpenses(month, page, 100);
            const rows = result.data || [];
            all.push(...rows);
            if (rows.length === 0 || all.length >= (result.total_count || 0)) return all;
        }
    }

    // clientId (a UUID) lets the API ignore a repeat of an entry it already saved.
    createExpense(month, { categoryGroupId, description, amount, transactedAt, note, clientId }) {
        return this._authedFetch(`/v1/budget-month/${month}/expense`, {
            method: 'POST',
            body: JSON.stringify({
                category_group_id: categoryGroupId ?? null,
                description,
                amount,
                transacted_at: transactedAt,
                note: note ?? null,
                client_id: clientId
            })
        });
    }

    updateExpense(id, { categoryGroupId, description, amount, transactedAt, note }) {
        return this._authedFetch(`/v1/expense/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                category_group_id: categoryGroupId ?? null,
                description,
                amount,
                transacted_at: transactedAt,
                note: note ?? null
            })
        });
    }

    deleteExpense(id) {
        return this._authedFetch(`/v1/expense/${id}`, { method: 'DELETE' });
    }

    // Bank sync (SimpleFIN)

    // Returns { is_owner, connection: null | { last_synced_at, last_error, accounts: [...] } }.
    getBankConnection() {
        return this._authedFetch('/v1/simplefin/connection');
    }

    // Owner only: links the budget to a bank with a SimpleFIN setup token, which the API
    // claims right away (it works once, so it isn't kept). Replaces any existing link and
    // returns the same shape as getBankConnection. Rejects if SimpleFIN refuses the token.
    connectBank(setupToken) {
        return this._authedFetch('/v1/simplefin/connection', {
            method: 'PUT',
            body: JSON.stringify({ setup_token: setupToken })
        });
    }

    // Owner only: unlinks the bank for everyone in the budget. Imported transactions stay.
    disconnectBank() {
        return this._authedFetch('/v1/simplefin/connection', { method: 'DELETE' });
    }

    // Sets a bank account's alias (null/blank clears it) and whether its
    // income/expense sign is flipped. Flipping removes the account's imported
    // transactions (resync_needed) so they can be re-imported correctly.
    updateBankAccount(id, { alias, invertAmounts }) {
        return this._authedFetch(`/v1/simplefin/accounts/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ alias: alias || null, invert_amounts: invertAmounts })
        });
    }

    syncBudgetMonth(month) {
        return this._authedFetch(`/v1/budget-month/${month}/sync`, { method: 'POST', timeoutMs: SLOW_REQUEST_TIMEOUT_MS });
    }
}

export default new ApiClient();
