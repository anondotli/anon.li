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
    recipientToken,
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
    submittingPassword,
    downloading,
    downloadProgress,
    currentFile,
    downloadError,
    clearDownloadError,
    downloadFile,
    downloadAll,
    canDownloadAsZip,
    canDownloadAllSeparately,
    isLimitedDrop,
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
        isLoading={submittingPassword}
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

  // Key/password accepted; metadata is still being decrypted.
  if (!drop) return <LoadingView />;

  return (
    <DropDownloadView
      drop={drop}
      keyString={keyString!}
      recipientToken={recipientToken}
      downloading={downloading}
      downloadProgress={downloadProgress}
      currentFile={currentFile}
      downloadError={downloadError}
      clearDownloadError={clearDownloadError}
      downloadFile={downloadFile}
      downloadAll={downloadAll}
      canDownloadAsZip={canDownloadAsZip}
      canDownloadAllSeparately={canDownloadAllSeparately}
      isLimitedDrop={isLimitedDrop}
      formatBytes={formatBytes}
    />
  );
}
