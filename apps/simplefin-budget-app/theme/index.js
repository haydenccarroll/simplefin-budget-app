// Design tokens for Bill and Dill's Eggcellent Budget. Colors follow a validated
// status palette (good/warning/critical) reused as the brand accent, since a
// budget app's primary color and its "on track" state are the same idea. The
// pickle/mustache/egg colors are the mascots' own and never signal status.
const colors = {
    primary: '#0ca30c',
    primaryDark: '#087a08',
    primaryDeep: '#055405',
    primaryTint: '#e4f5e1',

    warning: '#fab219',
    warningTint: '#fef3dc',

    critical: '#d03b3b',
    criticalDark: '#a82c2c',
    criticalTint: '#fbe6e6',

    mustache: '#5b3a1e',
    mustard: '#f2b632',
    mustardDark: '#c98f12',
    mustardTint: '#fff3cf',
    yolk: '#ffc83d',

    background: '#fbf9ea',
    surface: '#ffffff',
    surfaceAlt: '#f2f2ef',

    textPrimary: '#0b0b0b',
    textSecondary: '#52514e',
    textMuted: '#898781',
    textInverse: '#ffffff',

    border: '#e3e0c8',
    borderStrong: '#c9c5a3',
};

const spacing = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
};

const radii = {
    sm: 8,
    md: 12,
    lg: 16,
    pill: 999,
};

const typography = {
    hero: { fontSize: 48, fontWeight: '800' },
    title: { fontSize: 28, fontWeight: '800' },
    heading: { fontSize: 20, fontWeight: '800' },
    subheading: { fontSize: 16, fontWeight: '700' },
    body: { fontSize: 16, fontWeight: '400' },
    label: { fontSize: 13, fontWeight: '600' },
    caption: { fontSize: 12, fontWeight: '400' },
};

const shadow = {
    card: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
    },
};

// Severity thresholds for meters: fraction spent of what was planned.
function severityForRatio(ratio) {
    if (ratio > 1) return 'critical';
    if (ratio >= 0.8) return 'warning';
    return 'good';
}

const severityColor = {
    good: colors.primary,
    warning: colors.warning,
    critical: colors.critical,
};

const severityTint = {
    good: colors.primaryTint,
    warning: colors.warningTint,
    critical: colors.criticalTint,
};

// StyleSheet.absoluteFillObject was removed from React Native (only the registered
// StyleSheet.absoluteFill is left), but react-native-web still has it, so relying on it
// works in the browser and silently does nothing on a phone. Spread this instead.
const absoluteFill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 };

export const theme = { colors, spacing, radii, typography, shadow, absoluteFill, severityForRatio, severityColor, severityTint };
export default theme;
