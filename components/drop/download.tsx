"use client";

import { useDropDownload } from "@/hooks/use-drop-download";
import { type DropMetadata } from "@/lib/drop.actions.client";
import { LoadingView } from "./download/loading-view";
import { ErrorView } from "./download/error-view";
import { KeyInputView } from "./download/key-input";
import { PasswordInputView } from "./download/password-input";
import { DropDownloadView } from "./download/drop-view";

interface DropDownloadPageProps {
  fileId: string;
  initialDrop?: DropMetadata | null;
  initialError?: string | null;
}

export function DropDownloadPage({
  fileId,
  initialDrop,
  initialError,
}: DropDownloadPageProps) {
  const {
    drop,
    error,
    loading,
    keyString,
    needsKey,
    needsPassword,
    manualKeyInput,
    setManualKeyInput,
    manualKeyError,
    decryptionFailed,
    submitManualKey,
    password,
    setPassword,
    passwordError,
    submitPassword,
    downloading,
    downloadProgress,
    currentFile,
    downloadFile,
    downloadAll,
    formatBytes,
  } = useDropDownload({ dropId: fileId, initialDrop, initialError });

  if (loading) return <LoadingView />;
  if (error) return <ErrorView error={error} />;

  // If password required, show password input
  if (needsPassword) {
    return (
      <PasswordInputView
        passwordInput={password}
        setPasswordInput={setPassword}
        passwordError={passwordError}
        handlePasswordSubmit={submitPassword}
      />
    );
  }

  // If no key yet, show the key input view
  if (needsKey) {
    return (
      <KeyInputView
        manualKeyInput={manualKeyInput}
        setManualKeyInput={setManualKeyInput}
        manualKeyError={decryptionFailed ? "Decryption failed. The key may be incorrect." : manualKeyError}
        handleManualKeySubmit={submitManualKey}
      />
    );
  }

  if (!drop) return null;

  return (
    <DropDownloadView
      drop={drop}
      keyString={keyString!}
      downloading={downloading}
      downloadProgress={downloadProgress}
      currentFile={currentFile}
      downloadFile={downloadFile}
      downloadAll={downloadAll}
      formatBytes={formatBytes}
    />
  );
}
