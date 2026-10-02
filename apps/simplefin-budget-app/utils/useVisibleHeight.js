import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

// The height of what's actually visible: on iOS the on-screen keyboard covers the bottom of the page
// without resizing it, so window height overstates the space. Null means "no better figure than the
// container's own height" (not on the web, or no visualViewport). Needed by anything rendered outside
// #root (e.g. a Modal), which index.html's --app-height resize doesn't reach.
export default function useVisibleHeight(active = true) {
    const [height, setHeight] = useState(null);

    useEffect(() => {
        const viewport = Platform.OS === 'web' ? window.visualViewport : null;
        if (!active || !viewport) return undefined;
        const update = () => setHeight(Math.round(viewport.height));
        update();
        viewport.addEventListener('resize', update);
        return () => viewport.removeEventListener('resize', update);
    }, [active]);

    return height;
}
