"use client";

import { Key, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageWrapper } from "./page-wrapper";

interface KeyInputViewProps {
  manualKeyInput: string;
  setManualKeyInput: (val: string) => void;
  manualKeyError: string | null;
  handleManualKeySubmit: () => void;
  isLoading?: boolean;
}

export function KeyInputView({
  manualKeyInput,
  setManualKeyInput,
  manualKeyError,
  handleManualKeySubmit,
  isLoading = false
}: KeyInputViewProps) {
  // Handle paste of full URL - extract key from fragment
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted.includes('#')) {
      e.preventDefault();
      const key = pasted.split('#')[1];
      if (key) {
        setManualKeyInput(key);
      }
    }
  };

  return (
    <PageWrapper>
      <div className="max-w-sm w-full animate-in slide-in-from-bottom-4 duration-500">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-amber-500/10 flex items-center justify-center">
            <Key className="w-8 h-8 text-amber-500" />
          </div>
          <h1 className="text-2xl font-serif font-medium mb-2">Enter Decryption Key</h1>
          <p className="text-muted-foreground">
            Paste the full share link or the key from after the #
          </p>
        </div>

        <div className="space-y-4">
          <Input
            type="text"
            value={manualKeyInput}
            onChange={(e) => setManualKeyInput(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => !isLoading && e.key === "Enter" && handleManualKeySubmit()}
            placeholder="https://anon.li/d/...#key or key"
            className="h-12 text-center font-mono text-sm"
            disabled={isLoading}
          />
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            Passwords only work on password-protected drops. For link-only drops, use the full URL or the 43-character key after <span className="font-mono">#</span>.
          </p>
          {manualKeyError && <p className="text-sm text-destructive text-center">{manualKeyError}</p>}
          <Button
            className="w-full h-12 rounded-full"
            onClick={handleManualKeySubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Decrypting...
              </>
            ) : (
              "Decrypt Files"
            )}
          </Button>
        </div>
      </div>
    </PageWrapper>
  );
}
