// Haptic feedback hooks. A web app has no haptic engine, so these do nothing; callers
// keep calling them so they read the same wherever a tap matters.
const noop = () => {};

export const hapticSuccess = noop;
export const hapticWarning = noop;
export const hapticTap = noop;
export const hapticSelect = noop;
