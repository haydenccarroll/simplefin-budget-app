// Every touch anywhere in the app is reported here from the root view, so the
// pickles can look at whatever you tapped and wake up when you come back.

const listeners = new Set();

export function subscribeTouch(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

// Spread onto the root View. It only listens: returning false leaves the touch
// to whoever really owns it.
export const touchReporterProps = {
    onStartShouldSetResponderCapture: (event) => {
        const { pageX, pageY } = event.nativeEvent;
        listeners.forEach((listener) => listener(pageX, pageY));
        return false;
    },
};
