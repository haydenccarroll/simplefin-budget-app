import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'lastExpenseJar';

// The jar the last expense went into, so the next one can start there. Jars are copied
// into each new month with new ids, so the name is kept too for matching across months.
export async function rememberJar(jar) {
    try {
        if (jar) await AsyncStorage.setItem(KEY, JSON.stringify({ id: jar.id, label: jar.label }));
    } catch (error) {
        // a missing default is harmless
    }
}

// The remembered jar's id within `options` ({ id, label }), or null if it isn't there.
export async function recallJarId(options) {
    try {
        const stored = JSON.parse(await AsyncStorage.getItem(KEY));
        if (!stored) return null;
        const match = options.find((opt) => opt.id === stored.id)
            || options.find((opt) => opt.label.trim().toLowerCase() === String(stored.label).trim().toLowerCase());
        return match ? match.id : null;
    } catch (error) {
        return null;
    }
}
