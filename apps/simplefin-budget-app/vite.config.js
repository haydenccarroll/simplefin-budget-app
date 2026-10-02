import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

// The components are written with react-native primitives; react-native-web renders them as DOM.
// The sources are .js files that contain JSX, so esbuild is told to treat them as JSX.
export default defineConfig({
    plugins: [react({ include: /\.(js|jsx)$/ })],
    resolve: {
        alias: {
            'react-native': 'react-native-web',
            // react-native-svg imports this for image assets; the app has none.
            '@react-native/assets-registry/registry': fileURLToPath(new URL('./stubs/assets-registry.js', import.meta.url)),
        },
        extensions: ['.web.js', '.web.jsx', '.js', '.jsx', '.json'],
    },
    esbuild: { loader: 'jsx', include: /\.jsx?$/, exclude: /node_modules/ },
    // react-native-web's Animated calls global.cancelAnimationFrame when an animation is stopped, and
    // browsers have no `global`. Without this, interrupting any animation (swiping to another month
    // mid page-turn, leaving a screen mid-animation) throws and blanks the whole app.
    optimizeDeps: {
        esbuildOptions: { loader: { '.js': 'jsx' }, resolveExtensions: ['.web.js', '.js', '.jsx'], define: { global: 'globalThis' } },
    },
    define: { __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'), global: 'globalThis' },
    // 8081 is the origin the API allows by default (CORS_ALLOWED_ORIGINS).
    server: { port: 8081, host: true },
});
