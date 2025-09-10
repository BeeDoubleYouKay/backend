// Simple FX conversion utility.
// - Uses USD as a pivot: rate map is USD per 1 unit of the currency (e.g., EUR -> 1.10 means 1 EUR = 1.10 USD)
// - Supports special-case GBX (pence): 100 GBX = 1 GBP
// - Supports a few alias codes sometimes seen in feeds

export type FxRatesUSD = Record<string, number>; // code -> usdPerUnit

// Default map is intentionally sparse; provide your own via env FX_RATES_USD (JSON)
const DEFAULT_FX_RATES_USD: FxRatesUSD = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  JPY: 0.0065,
  CHF: 1.12,
  CAD: 0.73,
  AUD: 0.66,
  NZD: 0.60,
  BDT: 0.0086,
  CNY: 0.14,
  HKD: 0.13,
  SGD: 0.74,
  SEK: 0.093,
  NOK: 0.094,
  DKK: 0.15,
  PLN: 0.25,
  CZK: 0.044,
  HUF: 0.0028,
  INR: 0.012,
  ILS: 0.27,
  AED: 0.2723,
  SAR: 0.2667,
  QAR: 0.2747,
  KWD: 3.25,
  BHD: 2.65,
  TWD: 0.031,
  KRW: 0.00073,
  THB: 0.027,
  MYR: 0.21,
  IDR: 0.000062,
  PHP: 0.017,
  PKR: 0.0036,
  VND: 0.000039,
  BRL: 0.18,
  MXN: 0.055,
  CLP: 0.0011,
  ARS: 0.0011,
  COP: 0.00025,
  PEN: 0.27,
  RUB: 0.011,
  TRY: 0.030,
  EGP: 0.020,
  NGN: 0.00074,
  MAD: 0.099,
  RON: 0.22,
  RSD: 0.0092,
  ISK: 0.0073,
  KES: 0.0078,
  LKR: 0.0033,
  TND: 0.32,
  VES: 0.027,
  ZAR: 0.054,
};

function parseJsonRatesEnv(): FxRatesUSD | null {
  const raw = process.env.FX_RATES_USD;
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') return obj as FxRatesUSD;
  } catch {}
  return null;
}

export function normalizeCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.toUpperCase();
  // Handle common aliases / typos seen in some feeds
  if (c === 'ILA') return 'ILS';
  if (c === 'KWF') return 'KWD';
  if (c === 'ZAC') return 'ZAR';
  return c;
}

export function getFxRates(): FxRatesUSD {
  return { ...DEFAULT_FX_RATES_USD, ...(parseJsonRatesEnv() ?? {}) };
}

export function convertAmount(amount: number, fromCode: string, toCode: string, rates?: FxRatesUSD): number | null {
  const table = rates ?? getFxRates();
  let from = normalizeCode(fromCode);
  let to = normalizeCode(toCode);
  if (!from || !to) return null;

  // GBX (pence) handling: normalize GBX -> GBP with value/100
  let adjAmount = amount;
  if (from === 'GBX') {
    adjAmount = amount / 100; // pence -> pounds
    from = 'GBP';
  }
  // We won't output GBX; if asked to convert to GBX, convert to GBP then multiply by 100
  const outAsGBX = to === 'GBX';
  if (outAsGBX) to = 'GBP';

  if (from === to) return outAsGBX ? adjAmount * 100 : adjAmount;

  const usdPerFrom = table[from];
  const usdPerTo = table[to];
  if (!usdPerFrom || !usdPerTo) return null;
  const usd = adjAmount * usdPerFrom;
  const out = usd / usdPerTo;
  return outAsGBX ? out * 100 : out;
}

export function formatAmount(amount: number, code: string, maximumFractionDigits = 2): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code, maximumFractionDigits }).format(amount);
  } catch {
    // Fallback when Intl doesn't know the code (e.g., GBX)
    const sym = code === 'USD' ? '$' : '';
    return `${sym}${amount.toFixed(maximumFractionDigits)} ${code}`.trim();
  }
}

// Normalize a quoted price to the market currency, without cross-currency FX conversion.
// - Fix aliases (ILA->ILS, KWF->KWD, ZAC->ZAR)
// - GBX (pence) -> GBP by dividing by 100
// - Otherwise, return the original amount and normalized code
export function normalizeToMarketCurrency(amount: number, code?: string | null): { amount: number; currency: string } {
  const c = normalizeCode(code || 'USD') || 'USD';
  if (c === 'GBX') return { amount: amount / 100, currency: 'GBP' };
  return { amount, currency: c };
}
