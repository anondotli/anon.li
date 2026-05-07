// Hand-rolled anti-FOUC theme bootstrap script. Runs in <head> before paint
// to set the `dark`/`light` class on <html> based on stored preference.
//
// Mirrors what next-themes' SSR-injected script does, but with content WE
// control so we can hash-pin it in CSP. next-themes' own injected script
// will also try to run; without a nonce it gets blocked by CSP, but our
// pre-script already set the class, so functionally there's no FOUC.
//
// IMPORTANT: if you change THEME_INIT_SCRIPT, recompute THEME_INIT_SCRIPT_HASH
// using `node -e "..."` (see comment at the bottom of this file). The hash
// MUST exactly match the script bytes or the browser will block it under CSP.
export const THEME_INIT_SCRIPT =
    "(function(){try{var s=localStorage.getItem('theme');var d=s==='dark'||((!s||s==='system')&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.add(d?'dark':'light');document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();"

export const THEME_INIT_SCRIPT_HASH = "sha256-xsYa/WSNJCIX2x2WVd5Ht2LAAgtLDuD7AgFR4bM/29k="

// To recompute the hash:
//   node -e "const s=require('./lib/theme-init').THEME_INIT_SCRIPT;const c=require('crypto');console.log('sha256-'+c.createHash('sha256').update(s).digest('base64'))"
