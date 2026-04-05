"use client";

import { Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageWrapper } from "./page-wrapper";

interface PasswordInputViewProps {
  passwordInput: string;
  setPasswordInput: (val: string) => void;
  passwordError: string | null;
  handlePasswordSubmit: () => void;
  isLoading?: boolean;
}

export function PasswordInputView({
  passwordInput,
  setPasswordInput,
  passwordError,
  handlePasswordSubmit,
  isLoading = false
}: PasswordInputViewProps) {
  return (
    <PageWrapper>
      <div className="max-w-sm w-full animate-in slide-in-from-bottom-4 duration-500">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-amber-500/10 flex items-center justify-center">
            <Lock className="w-8 h-8 text-amber-500" />
          </div>
          <h1 className="text-2xl font-serif font-medium mb-2">Password Protected</h1>
          <p className="text-muted-foreground">
            Enter the password to access these files
          </p>
        </div>

        <div className="space-y-4">
          <Input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => !isLoading && e.key === "Enter" && handlePasswordSubmit()}
            placeholder="Enter password..."
            className="h-12 text-center font-mono text-sm"
            autoFocus
            disabled={isLoading}
          />
          {passwordError && <p className="text-sm text-destructive text-center">{passwordError}</p>}
          <Button
            className="w-full h-12 rounded-full"
            onClick={handlePasswordSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Unlocking...
              </>
            ) : (
              "Unlock Files"
            )}
          </Button>
        </div>
      </div>
    </PageWrapper>
  );
}
