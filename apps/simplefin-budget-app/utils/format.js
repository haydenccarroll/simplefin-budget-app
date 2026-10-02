import copy from '../copy';

const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

export function formatCurrency(amount) {
    const value = Number(amount) || 0;
    return currencyFormatter.format(value);
}

// Renders negative amounts with a leading minus outside the $ sign (-$12.00
// instead of $-12.00), which is how budget apps conventionally show overspend.
export function formatSignedCurrency(amount) {
    const value = Number(amount) || 0;
    if (value < 0) return `-${currencyFormatter.format(Math.abs(value))}`;
    return currencyFormatter.format(value);
}

const monthLabelFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });

// monthKey is "YYYY-MM"
export function formatMonthLabel(monthKey) {
    const [year, month] = monthKey.split('-').map(Number);
    return monthLabelFormatter.format(new Date(year, month - 1, 1));
}

export function currentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonthKey(monthKey, delta) {
    const [year, month] = monthKey.split('-').map(Number);
    const date = new Date(year, month - 1 + delta, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function todayISODate() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function yesterdayISODate() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Returns '' for a missing date (dates are optional).
export function formatDateLabel(isoDate) {
    if (!isoDate) return '';
    const [year, month, day] = isoDate.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Who a shared-budget expense or income item came from: the first name of
// the user who added it, or the name of the bank account it was imported from.
export function formatSource(item) {
    if (item?.from_sync) return item.source_account || copy.common.bankSync;
    if (item?.created_by) return copy.common.addedBy(item.created_by);
    return '';
}
