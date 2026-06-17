import { CURRENCY_SYMBOLS, RATES_TO_BDT } from '@/constants/data';

export function getCurrencySymbol(c: string): string {
  return CURRENCY_SYMBOLS[c] || c;
}

export function convertToPreferred(amount: number, fromCurrency: string, preferredCurrency: string): number {
  if (fromCurrency === preferredCurrency) return amount;
  const toBDT = (RATES_TO_BDT[fromCurrency] || 1) * amount;
  return toBDT / (RATES_TO_BDT[preferredCurrency] || 1);
}

export function fmtCurrency(n: number, currency: string): string {
  const sym = getCurrencySymbol(currency);
  return sym + Number(n || 0).toLocaleString('en', { maximumFractionDigits: 2 });
}

export function fmtPreferred(n: number, preferredCurrency: string): string {
  return fmtCurrency(n, preferredCurrency);
}
