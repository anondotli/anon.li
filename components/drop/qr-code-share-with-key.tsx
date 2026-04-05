"use client";

import { useEffect, useState } from "react";
import { QrCode } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getStoredEncryptionKey } from "@/lib/upload-resume.client";
import { QRCodeShare } from "@/components/drop/qr-code-share";

interface QRCodeShareWithKeyProps {
  disabled?: boolean;
  dropId: string;
  url: string;
  title: string;
  customKey?: boolean;
}

export function QRCodeShareWithKey({ disabled = false, dropId, url, title, customKey }: QRCodeShareWithKeyProps) {
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadKey() {
      try {
        const key = await getStoredEncryptionKey(dropId);
        if (!cancelled) {
          setEncryptionKey(key);
        }
      } catch {
        // Key not available.
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadKey();

    return () => {
      cancelled = true;
    };
  }, [dropId]);

  if (loading) {
    return (
      <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
        <QrCode className="h-4 w-4 opacity-50" />
      </Button>
    );
  }

  return <QRCodeShare disabled={disabled} url={url} title={title} encryptionKey={customKey ? null : encryptionKey} />;
}
