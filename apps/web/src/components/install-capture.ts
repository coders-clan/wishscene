/** Fired on window once the browser offers to install the app. */
export const INSTALLABLE_EVENT = 'wishscene:installable';

/**
 * Inline <head> script: Chrome can fire beforeinstallprompt before React hydrates, so keep the
 * event for the install sheet. Only phones, which have the sheet, lose the browser's mini-infobar.
 */
export const installCaptureScript = `addEventListener('beforeinstallprompt',function(e){if(matchMedia('(max-width: 600px)').matches)e.preventDefault();window.__wishsceneInstall=e;dispatchEvent(new Event('${INSTALLABLE_EVENT}'))});`;
