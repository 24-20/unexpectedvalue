const NOK = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });

export function formatNOK(n: number) {
  return `${NOK.format(Math.round(n))} NOK`;
}

export function formatNOKDelta(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${NOK.format(Math.round(Math.abs(n)))} NOK`;
}

export function formatPct(n: number, digits = 2) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n).toFixed(digits).replace(".", ",")}%`;
}

export function formatDateNo(t: number) {
  return new Date(t).toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}
