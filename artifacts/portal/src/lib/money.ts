export type DisplayCurrency = "USD" | "UGX";

export function formatMoney(
  amount: number | string | null | undefined,
  enteredCurrency: string = "USD",
  displayCurrency: DisplayCurrency = "USD",
  usdToUgxRate: number | null = null,
): string {
  const num = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
  if (isNaN(num)) return "—";

  let converted = num;
  if (enteredCurrency !== displayCurrency && usdToUgxRate) {
    if (enteredCurrency === "USD" && displayCurrency === "UGX") {
      converted = num * usdToUgxRate;
    } else if (enteredCurrency === "UGX" && displayCurrency === "USD") {
      converted = num / usdToUgxRate;
    }
  }

  if (displayCurrency === "UGX") {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: "UGX",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(converted);
  }

  if (Math.abs(converted) >= 1_000_000) {
    return `$${(converted / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(converted) >= 1_000) {
    return `$${(converted / 1_000).toFixed(0)}k`;
  }
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(converted);
}

export function formatMoneyFull(
  amount: number | string | null | undefined,
  enteredCurrency: string = "USD",
  displayCurrency: DisplayCurrency = "USD",
  usdToUgxRate: number | null = null,
): string {
  const num = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
  if (isNaN(num)) return "—";

  let converted = num;
  if (enteredCurrency !== displayCurrency && usdToUgxRate) {
    if (enteredCurrency === "USD" && displayCurrency === "UGX") {
      converted = num * usdToUgxRate;
    } else if (enteredCurrency === "UGX" && displayCurrency === "USD") {
      converted = num / usdToUgxRate;
    }
  }

  if (displayCurrency === "UGX") {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: "UGX",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(converted);
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(converted);
}
