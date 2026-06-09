import "server-only";
import { createHash, timingSafeEqual } from "crypto";

export const ADMIN_COOKIE_NAME = "admin_session";
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24; // 24h

function getAdminOtp(): string {
  const otp = process.env.ADMIN_OTP;
  if (!otp || !/^\d{6}$/.test(otp)) {
    throw new Error("ADMIN_OTP env var must be a 6-digit string");
  }
  return otp;
}

// Deterministic session value derived from the OTP. Rotating ADMIN_OTP
// invalidates every existing cookie automatically.
export function adminSessionValue(): string {
  return createHash("sha256")
    .update(`${getAdminOtp()}:gutta-printer-admin`)
    .digest("hex");
}

export function verifyAdminCookie(value: string | undefined): boolean {
  if (!value) return false;
  let expected: string;
  try {
    expected = adminSessionValue();
  } catch {
    return false;
  }
  if (value.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function checkOtp(code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  let expected: string;
  try {
    expected = getAdminOtp();
  } catch {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(code), Buffer.from(expected));
  } catch {
    return false;
  }
}
