// Hand-rolled anti-FOUC theme bootstrap script. Runs in <head> before paint
// to set the `dark`/`light` class on <html> based on stored preference.
//
// Mirrors what next-themes' SSR-injected script does, but with content WE
// control. next-themes' own injected script will also try to run; without a
// nonce it gets blocked by CSP, but our pre-script already set the class, so
// functionally there's no FOUC.
export const THEME_INIT_SCRIPT =
    "(function(){try{var s=localStorage.getItem('theme');var d=s==='dark'||((!s||s==='system')&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.add(d?'dark':'light');document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();"
