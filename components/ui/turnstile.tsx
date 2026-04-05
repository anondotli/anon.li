"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface TurnstileProps {
    siteKey: string;
    onVerify: (token: string) => void;
    onError?: () => void;
    onExpire?: () => void;
    theme?: "light" | "dark" | "auto";
    size?: "normal" | "compact" | "flexible";
}

interface TurnstileRenderOptions {
    sitekey: string;
    callback: (token: string) => void;
    "error-callback"?: () => void;
    "expired-callback"?: () => void;
    theme?: "light" | "dark" | "auto";
    size?: "normal" | "compact" | "flexible";
}

declare global {
    interface Window {
        turnstile: {
            render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
            remove: (widgetId: string) => void;
            reset: (widgetId: string) => void;
        };
    }
}

const SCRIPT_LOAD_TIMEOUT = 10000;

// Check if turnstile is already loaded (for initial state)
function isTurnstileReady(): boolean {
    return typeof window !== "undefined" && !!window.turnstile;
}

export function Turnstile({
    siteKey,
    onVerify,
    onError,
    onExpire,
    theme = "auto",
    size = "normal",
}: TurnstileProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const [isScriptReady, setIsScriptReady] = useState(isTurnstileReady);
    const [hasError, setHasError] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const hasErrorRef = useRef(false);

    const onVerifyRef = useRef(onVerify);
    const onErrorRef = useRef(onError);
    const onExpireRef = useRef(onExpire);

    // Keep refs in sync with latest props without triggering re-renders
    useEffect(() => {
        onVerifyRef.current = onVerify;
        onErrorRef.current = onError;
        onExpireRef.current = onExpire;
    });

    // Load Turnstile script
    useEffect(() => {
        if (typeof window === "undefined") return;

        // Already loaded - state was initialized correctly
        if (window.turnstile) {
            return;
        }

        // Check if script is already being loaded
        let script = document.querySelector<HTMLScriptElement>(
            'script[src*="challenges.cloudflare.com/turnstile"]'
        );

        const handleLoad = () => {
            if (window.turnstile) {
                setIsScriptReady(true);
            }
        };

        const handleError = () => {
            setHasError(true);
        };

        if (!script) {
            script = document.createElement("script");
            script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
            script.async = true;
            script.defer = true;
            document.head.appendChild(script);
        }

        script.addEventListener("load", handleLoad);
        script.addEventListener("error", handleError);

        // Timeout fallback
        const timeout = setTimeout(() => {
            if (!window.turnstile) {
                setHasError(true);
            }
        }, SCRIPT_LOAD_TIMEOUT);

        return () => {
            script?.removeEventListener("load", handleLoad);
            script?.removeEventListener("error", handleError);
            clearTimeout(timeout);
        };
    }, [retryCount]);

    // Track render error in ref and sync to state via microtask
    const scheduleErrorUpdate = useCallback(() => {
        // Use queueMicrotask to defer the setState call outside of the effect body
        queueMicrotask(() => {
            if (hasErrorRef.current) {
                setHasError(true);
            }
        });
    }, []);

    useEffect(() => {
        if (!isScriptReady || !containerRef.current || !window.turnstile) return;

        try {
            widgetIdRef.current = window.turnstile.render(containerRef.current, {
                sitekey: siteKey,
                callback: (token: string) => onVerifyRef.current(token),
                "error-callback": () => onErrorRef.current?.(),
                "expired-callback": () => onExpireRef.current?.(),
                theme,
                size,
            });
        } catch {
            // Track error in ref and schedule state update outside effect body
            hasErrorRef.current = true;
            scheduleErrorUpdate();
        }

        return () => {
            if (widgetIdRef.current && window.turnstile) {
                try {
                    window.turnstile.remove(widgetIdRef.current);
                } catch {
                    // Ignore cleanup errors
                }
                widgetIdRef.current = null;
            }
        };
    }, [isScriptReady, siteKey, theme, size, scheduleErrorUpdate]);

    const handleRetry = () => {
        setHasError(false);
        setIsScriptReady(false);
        setRetryCount((c) => c + 1);
    };

    if (hasError) {
        return (
            <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-sm">
                <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="w-4 h-4" />
                    <span>Captcha failed to load</span>
                </div>
                <p className="text-muted-foreground text-xs text-center">
                    Please check your internet connection and try again.
                </p>
                <button
                    onClick={handleRetry}
                    className="flex items-center gap-1.5 text-xs text-primary hover:underline mt-1"
                >
                    <RefreshCw className="w-3 h-3" />
                    Try again
                </button>
            </div>
        );
    }

    if (!isScriptReady) {
        return (
            <div className="flex items-center justify-center min-h-[65px]">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Loading captcha...</span>
                </div>
            </div>
        );
    }

    return <div ref={containerRef} className="min-h-[65px]" />;
}
