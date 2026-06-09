"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mono } from "@/components/ui";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { ShieldCheckIcon } from "@/components/icons";

export function AdminOtpForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (code: string) => {
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        if (!res.ok) {
          setError("Invalid code");
          setValue("");
          setSubmitting(false);
          return;
        }
        router.refresh();
      } catch {
        setError("Network error");
        setValue("");
        setSubmitting(false);
      }
    },
    [router],
  );

  useEffect(() => {
    if (value.length === 6 && !submitting) {
      submit(value);
    }
  }, [value, submitting, submit]);

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="inline-flex items-center gap-2 text-muted">
          <ShieldCheckIcon className="w-4 h-4" />
          <Mono>[ Admin ]</Mono>
        </div>
        <h1 className="mt-3 text-2xl sm:text-3xl font-medium tracking-tight">
          Enter access code
        </h1>
        <p className="mt-2 text-sm text-muted">
          Six-digit one-time code.
        </p>

        <div className="mt-8 flex justify-center">
          <InputOTP
            maxLength={6}
            value={value}
            onChange={setValue}
            autoFocus
            disabled={submitting}
            inputMode="numeric"
            pattern="^[0-9]+$"
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>

        <div className="mt-4 min-h-[20px] text-center font-mono text-xs">
          {error && <span className="text-down">{error}</span>}
          {submitting && !error && <span className="text-muted">Checking…</span>}
        </div>
      </div>
    </div>
  );
}
