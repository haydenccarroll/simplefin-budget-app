import React, { createContext, useContext, useState } from 'react';
import { currentMonthKey } from './format';

const MonthContext = createContext(null);

// The month being looked at, shared by the Budget and Expenses pages so going between them
// keeps you in the same month.
export function MonthProvider({ children }) {
    const [monthKey, setMonthKey] = useState(currentMonthKey());
    return <MonthContext.Provider value={{ monthKey, setMonthKey }}>{children}</MonthContext.Provider>;
}

export const useMonth = () => useContext(MonthContext);
