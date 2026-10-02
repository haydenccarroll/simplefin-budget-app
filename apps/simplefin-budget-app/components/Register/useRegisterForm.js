// useRegisterForm.js

import { useReducer, useEffect } from 'react';
import apiClient from '../../api/client';
import copy from '../../copy';

const initialState = {
    firstName: '',
    lastName: '',
    username: '',
    password: '',
    passwordAgain: '',
    timezone: 'America/Denver',
    usernameError: '',
    passwordError: '',
    registerError: '',
    isFormValid: false,
};

const actionTypes = {
    setFirstName: 'setFirstName',
    setLastName: 'setLastName',
    setUsername: 'setUsername',
    setPassword: 'setPassword',
    setPasswordAgain: 'setPasswordAgain',
    setTimezone: 'setTimezone',
    setUsernameError: 'setUsernameError',
    setPasswordError: 'setPasswordError',
    setIsFormValid: 'setIsFormValid',
    setRegisterError: 'setRegisterError',
};

const reducer = (state, action) => {
    switch (action.type) {
        case actionTypes.setFirstName:
            return { ...state, firstName: action.payload };
        case actionTypes.setLastName:
            return { ...state, lastName: action.payload };
        case actionTypes.setUsername:
            return { ...state, username: action.payload };
        case actionTypes.setPassword:
            return { ...state, password: action.payload };
        case actionTypes.setPasswordAgain:
            return { ...state, passwordAgain: action.payload };
        case actionTypes.setTimezone:
            return { ...state, timezone: action.payload };
        case actionTypes.setUsernameError:
            return { ...state, usernameError: action.payload };
        case actionTypes.setPasswordError:
            return { ...state, passwordError: action.payload };
        case actionTypes.setIsFormValid:
            return { ...state, isFormValid: action.payload };
        case actionTypes.setRegisterError:
            return { ...state, registerError: action.payload };
        default:
            return state;
    }
};

const useRegisterForm = () => {
    const [state, dispatch] = useReducer(reducer, initialState);

    useEffect(() => {
        const isFormValid = state.username && state.password && state.passwordAgain && !state.usernameError && !state.passwordError;
        dispatch({ type: actionTypes.setIsFormValid, payload: isFormValid });
    }, [state.username, state.password, state.passwordAgain, state.usernameError, state.passwordError]);

    return { state, dispatch };
};

const handleBlurValidateUsername = (state, dispatch) => {
    const ok = /^[A-Za-z0-9][A-Za-z0-9._-]{2,29}$/.test(state.username.trim());
    const usernameError = ok ? '' : copy.register.usernameInvalid;
    dispatch({ type: actionTypes.setUsernameError, payload: usernameError });
};

const handleBlurValidatePassword = (state, dispatch) => {
    let passwordError = '';
    if (state.password.length < 8) passwordError = copy.register.passwordTooShort;
    else if (state.password !== state.passwordAgain) passwordError = copy.register.passwordMismatch;
    dispatch({ type: actionTypes.setPasswordError, payload: passwordError });
};

const handleRegister = async (state, dispatch, navigation, showToast) => {
    try {
        await apiClient.register({
            username: state.username.trim(),
            password: state.password,
            firstName: state.firstName,
            lastName: state.lastName,
            timezone: state.timezone,
        });
        // A new account has no budget yet: create one or join a friend's.
        navigation.replace('Onboarding');
    } catch (error) {
        if (error.status === 400 || error.status === 409 || error.status === 429) {
            dispatch({ type: actionTypes.setRegisterError, payload: error.message });
        } else if (error.status) {
            dispatch({ type: actionTypes.setRegisterError, payload: copy.register.unexpectedError });
        } else {
            showToast(copy.common.networkError);
        }
    }
};

export { actionTypes, handleBlurValidateUsername, handleBlurValidatePassword, handleRegister, useRegisterForm };