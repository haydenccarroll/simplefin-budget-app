// Replace everything on the app's root stack with one screen (to sign out, or to send someone
// to create-or-join a budget). Screens inside the tabs call this with their own `navigation`,
// since resetting that would only reset the tabs.
export function resetRootTo(navigation, name) {
    const root = navigation.getParent('RootStack') || navigation;
    root.reset({ index: 0, routes: [{ name }] });
}
