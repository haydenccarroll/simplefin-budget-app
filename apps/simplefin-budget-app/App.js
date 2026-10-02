import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import apiClient from './api/client';
import Login from './components/Login/Login';
import Register from './components/Register/Register';
import Home from './components/Home/Home';
import Expenses from './components/Expenses/Expenses';
import Profile from './components/Profile/Profile';
import Onboarding from './components/Onboarding/Onboarding';
import MonthPicker from './components/MonthPicker/MonthPicker';
import ChangePassword from './components/ChangePassword/ChangePassword';
import IncomeItemForm from './components/IncomeItem/IncomeItemForm';
import CategoryGroupForm from './components/CategoryGroup/CategoryGroupForm';
import ExpenseForm from './components/Expense/ExpenseForm';
import LinkedBankAccounts from './components/BankSync/LinkedBankAccounts';
import FunPopupHost from './components/Fun/FunPopup';
import { ToastProvider } from './components/Toast/Toast';
import theme from './theme';
import { touchReporterProps } from './utils/touchBus';
import { MonthProvider } from './utils/MonthContext';
import { startOfflineSync } from './utils/offlineQueue';

const Stack = createStackNavigator();
const navigationRef = createNavigationContainerRef();

// Screens that don't need a session.
const PUBLIC_ROUTES = ['Login', 'Register'];

// Screens where being budget-less is normal (or where there's nowhere to go yet).
const NO_REDIRECT_ROUTES = ['Login', 'Register', 'Onboarding'];

export default function App() {
    const [initialRouteName, setInitialRouteName] = useState(null);

    // If the API ever says this person isn't in a budget (they were removed from theirs,
    // say), send them to the create-or-join screen from wherever they are.
    useEffect(() => {
        apiClient.setNoBudgetHandler(() => {
            if (!navigationRef.isReady()) return;
            const current = navigationRef.getCurrentRoute()?.name;
            if (current && !NO_REDIRECT_ROUTES.includes(current)) {
                navigationRef.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
            }
        });
        return () => apiClient.setNoBudgetHandler(null);
    }, []);

    // If the API says the session is over (it expired, or the password was changed on another
    // device), send the person to sign in again.
    useEffect(() => {
        apiClient.setSignedOutHandler(() => {
            if (!navigationRef.isReady()) return;
            const current = navigationRef.getCurrentRoute()?.name;
            if (current && !PUBLIC_ROUTES.includes(current)) {
                navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
            }
        });
        return () => apiClient.setSignedOutHandler(null);
    }, []);

    // Entries made offline are sent as soon as the API can be reached.
    useEffect(() => startOfflineSync(), []);

    useEffect(() => {
        getInitialRoute().then(
            (route) => setInitialRouteName(route)
        );
    }, []);

    const getInitialRoute = async () => {
        try {
            const hasValidSession = await apiClient.hasValidSession();
            return hasValidSession ? 'Home' : 'Login';
        } catch (error) {
            console.error('Failed to check session', error);
            return 'Login';
        }
    };

    if (initialRouteName === null) {
        return null; // or render a loading indicator
    }

    return (
        <SafeAreaProvider>
            <ToastProvider>
              <MonthProvider>
                <View style={{ flex: 1, backgroundColor: theme.colors.background }} {...touchReporterProps}>
                    <NavigationContainer ref={navigationRef}>
                        <Stack.Navigator initialRouteName={initialRouteName} id="RootStack" screenOptions={{ headerShown: false, cardStyle: { flex: 1, backgroundColor: theme.colors.background } }}>
                            <Stack.Screen name="Login" component={Login} />
                            <Stack.Screen name="Register" component={Register} />
                            <Stack.Screen name="MonthPicker" component={MonthPicker} />
                            <Stack.Screen name="ChangePassword" component={ChangePassword} />
                            <Stack.Screen name="Onboarding" component={Onboarding} />
                            <Stack.Screen name="Home" component={Home} />
                            <Stack.Screen name="Expenses" component={Expenses} />
                            <Stack.Screen name="Profile" component={Profile} />
                            <Stack.Screen name="IncomeItemForm" component={IncomeItemForm} />
                            <Stack.Screen name="CategoryGroupForm" component={CategoryGroupForm} />
                            <Stack.Screen name="ExpenseForm" component={ExpenseForm} />
                            <Stack.Screen name="LinkedBankAccounts" component={LinkedBankAccounts} />
                        </Stack.Navigator>
                    </NavigationContainer>
                    <FunPopupHost />
                </View>
              </MonthProvider>
            </ToastProvider>
        </SafeAreaProvider>
    );
}
