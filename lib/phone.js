// Firebase needs the number with its country code (+1 4165551234). People
// type it the local way, so a 10-digit number is taken as Canada/US.
export function toE164(raw) {
  const text = String(raw || "").trim();
  const digits = text.replace(/\D/g, "");
  if (text.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}
