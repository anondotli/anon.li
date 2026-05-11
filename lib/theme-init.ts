// Hand-rolled anti-FOUC theme bootstrap script. Runs in <head> before paint
// to set the `dark`/`light` class on <html> based on stored preference.
//
// Mirrors what next-themes' SSR-injected script does, but with content WE
// control so its SHA-256 can be pinned in the strict-mode CSP (see proxy.ts).
// next-themes' own injected script is also pinned by hash there; both must be
// kept in sync if their content ever changes.
export const THEME_INIT_SCRIPT =
    "(function(){try{var s=localStorage.getItem('theme');var d=s==='dark'||((!s||s==='system')&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.add(d?'dark':'light');document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();"

// SHA-256 of THEME_INIT_SCRIPT, base64-encoded. Pinned in script-src in
// strict-mode CSP so the inline <script> executes without a nonce (the layout
// is shared with edge-cached marketing pages that have no per-request nonce).
// Regenerate with:
//   node -e "const c=require('crypto');const {THEME_INIT_SCRIPT}=require('./lib/theme-init');console.log(c.createHash('sha256').update(THEME_INIT_SCRIPT).digest('base64'))"
export const THEME_INIT_SCRIPT_SHA256 = "xsYa/WSNJCIX2x2WVd5Ht2LAAgtLDuD7AgFR4bM/29k="
