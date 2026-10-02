// useLoginForm.js

import { useReducer, useEffect } from 'react';
import apiClient from '../../api/client';
import copy from '../../copy';

const initialState = {
    username: '',
    password: '',
    passwordError: '',
    loginError: '',
    isFormValid: false,
};

const actionTypes = {
    setUsername: 'setUsername',
    setPassword: 'setPassword',
    setPasswordError: 'setPasswordError',
    setIsFormValid: 'setIsFormValid',
    setLoginError: 'setLoginError',
};

const reducer = (state, action) => {
    switch (action.type) {
        case actionTypes.setUsername:
            return { ...state, username: action.payload };
        case actionTypes.setPassword:
            return { ...state, password: action.payload };
        case actionTypes.setPasswordError:
            return { ...state, passwordError: action.payload };
        case actionTypes.setIsFormValid:
            return { ...state, isFormValid: action.payload };
        case actionTypes.setLoginError:
            return { ...state, loginError: action.payload };
        default:
            return state;
    }
};

const useLoginForm = () => {
    const [state, dispatch] = useReducer(reducer, initialState);

    useEffect(() => {
        const isFormValid = state.username && state.password && !state.passwordError;
        dispatch({ type: actionTypes.setIsFormValid, payload: isFormValid });
    }, [state.username, state.password, state.passwordError]);

    return { state, dispatch };
};

const handleLogin = async (state, dispatch, navigation, showToast) => {
    try {
        await apiClient.login(state.username.trim(), state.password);
        navigation.replace('Home');
    } catch (error) {
        if (error.status === 401 || error.status === 429) {
            dispatch({ type: actionTypes.setLoginError, payload: error.message });
        } else if (error.status) {
            dispatch({ type: actionTypes.setLoginError, payload: copy.login.unexpectedError });
        } else {
            showToast(copy.common.networkError);
        }
    }
};

export { actionTypes, handleLogin, useLoginForm };