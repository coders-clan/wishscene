/** Fired on window once the browser offers to install the app. */
export const INSTALLABLE_EVENT = 'wishscene:installable';

/**
 * Inline <head> script: Chrome can fire beforeinstallprompt before React hydrates, so keep the
 * event for the install sheet instead of letting the browser show its own mini-infobar.
 */
export const installCaptureScript = `addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__wishsceneInstall=e;dispatchEvent(new Event('${INSTALLABLE_EVENT}'))});`;
