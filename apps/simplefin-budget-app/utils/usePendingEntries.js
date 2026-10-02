import { useEffect, useState } from 'react';
import { listPending, subscribePending } from './offlineQueue';

// The entries made offline that are still waiting to be sent (for one month, or all of
// them), kept current as they're added and as they go through.
export default function usePendingEntries(month) {
    const [entries, setEntries] = useState([]);
    useEffect(() => {
        let active = true;
        const refresh = () => listPending(month).then((list) => { if (active) setEntries(list); });
        refresh();
        const unsubscribe = subscribePending(refresh);
        return () => { active = false; unsubscribe(); };
    }, [month]);
    return entries;
}

// Expenses saved offline for a month, shaped like the API's so they list alongside the real
// ones, and marked `pending` until the API has them. `pendingCount` is every queued entry
// (expenses and income) for the month.
export function useWaitingExpenses(month) {
    const entries = usePendingEntries(month);
    const waiting = entries
        .filter((entry) => entry.kind === 'expense')
        .map((entry) => ({
            id: `pending-${entry.clientId}`,
            pending: true,
            description: entry.payload.description,
            amount: entry.payload.amount,
            transacted_at: entry.payload.transactedAt,
            category_name: entry.display?.categoryName ?? null,
        }));
    return { waiting, pendingCount: entries.length };
}
