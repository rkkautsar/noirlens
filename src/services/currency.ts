/**
 * Offline price detection and approximate FX conversion.
 *
 * Rates are static, USD-based estimates bundled with the app. They are not
 * live; every surface that shows a conversion labels it as an estimate.
 */

export interface CurrencyDef {
  code: string;
  symbol: string;
  decimals: number;
  decimalSeparator: '.' | ',';
  groupSeparator: ',' | '.' | ' ' | '’';
  /** USD value of one unit. */
  usdPerUnit: number;
}

export const RATES_AS_OF = 'Nov 2026';

const DATA: CurrencyDef[] = [
  { code: 'USD', symbol: '$', decimals: 2, decimalSeparator: '.', groupSeparator: ',', usdPerUnit: 1 },
  { code: 'EUR', symbol: '€', decimals: 2, decimalSeparator: ',', groupSeparator: '.', usdPerUnit: 1.09 },
  { code: 'GBP', symbol: '£', decimals: 2, decimalSeparator: '.', groupSeparator: ',', usdPerUnit: 1.27 },
  { code: 'JPY', symbol: '¥', decimals: 0, decimalSeparator: '.', groupSeparator: ',', usdPerUnit: 0.0064 },
  { code: 'CNY', symbol: '¥', decimals: 2, decimalSeparator: '.', groupSeparator: ',', usdPerUnit: 0.138 },
  { code: 'KRW', symbol: '₩', decimals: 0, decimalSeparator: '.', groupSeparator: ',', usdPerUnit: 0.0007 },
  { code: 'IDR', symbol: 'Rp', decimals: 0, decimalSeparator: ',', groupSeparator: '.', usdPerUnit: 0.000062 },
  { code: 'THB', symbol: '฿', decimals: 2, decimalSeparator: '.', groupSeparator: ',', usdPerUnit: 0.028 },
  { code: 'VND', symbol: '₫', decimals: 0, decimalSeparator: ',', groupSeparator: '.', usdPerUnit: 0.000039 },
  { code: 'SGD', symbol: 'S$', decimals: 2, decimalSeparator: '.', groupSeparator: ',', usdPerUnit: 0.74 },
  { code: 'MYR', symbol: 'RM', decimals: 2, decimalSeparator: '.', groupSeparator: ',', usdPerUnit: 0.22 },
  { code: 'PHP', symbol: '₱', decimals: 2, decimalSeparator: '.', groupSeparator: ',', usdPerUnit: 0.017 },
  { code: 'INR', symbol: '₹', decimals: 2, decimalSeparator: '.', groupSeparator: ',', usdPerUnit: 0.012 },
  { code: 'AUD', symbol: 'A$', decimals: 2, decimalSeparator: '.', groupSeparator: ',', usdPerUnit: 0.66 },
  { code: 'CAD', symbol: 'C$', decimals: 2, decimalSeparator: '.', groupSeparator: ',', usdPerUnit: 0.72 },
  { code: 'CHF', symbol: 'CHF', decimals: 2, decimalSeparator: '.', groupSeparator: '’', usdPerUnit: 1.12 },
  { code: 'SEK', symbol: 'kr', decimals: 2, decimalSeparator: ',', groupSeparator: ' ', usdPerUnit: 0.095 },
  { code: 'NOK', symbol: 'kr', decimals: 2, decimalSeparator: ',', groupSeparator: ' ', usdPerUnit: 0.092 },
  { code: 'DKK', symbol: 'kr', decimals: 2, decimalSeparator: ',', groupSeparator: '.', usdPerUnit: 0.145 },
  { code: 'PLN', symbol: 'zł', decimals: 2, decimalSeparator: ',', groupSeparator: ' ', usdPerUnit: 0.25 },
  { code: 'CZK', symbol: 'Kč', decimals: 2, decimalSeparator: ',', groupSeparator: ' ', usdPerUnit: 0.043 },
  { code: 'HUF', symbol: 'Ft', decimals: 0, decimalSeparator: ',', groupSeparator: ' ', usdPerUnit: 0.0027 },
  { code: 'RON', symbol: 'lei', decimals: 2, decimalSeparator: ',', groupSeparator: '.', usdPerUnit: 0.22 },
  { code: 'TRY', symbol: '₺', decimals: 2, decimalSeparator: ',', groupSeparator: '.', usdPerUnit: 0.029 },
  { code: 'BRL', symbol: 'R$', decimals: 2, decimalSeparator: ',', groupSeparator: '.', usdPerUnit: 0.18 },
  { code: 'MXN', symbol: 'MX$', decimals: 2, decimalSeparator: '.', groupSeparator: ',', usdPerUnit: 0.055 },
  { code: 'ZAR', symbol: 'R', decimals: 2, decimalSeparator: '.', groupSeparator: ' ', usdPerUnit: 0.055 },
  { code: 'AED', symbol: 'د.إ', decimals: 2, decimalSeparator: '.', groupSeparator: ',', usdPerUnit: 0.272 },
  { code: 'SAR', symbol: 'ر.س', decimals: 2, decimalSeparator: '.', groupSeparator: ',', usdPerUnit: 0.267 },
  { code: 'ILS', symbol: '₪', decimals: 2, decimalSeparator: '.', groupSeparator: ',', usdPerUnit: 0.27 },
  { code: 'RUB', symbol: '₽', decimals: 2, decimalSeparator: ',', groupSeparator: ' ', usdPerUnit: 0.011 },
  { code: 'NZD', symbol: 'NZ$', decimals: 2, decimalSeparator: '.', groupSeparator: ',', usdPerUnit: 0.6 },
  { code: 'HKD', symbol: 'HK$', decimals: 2, decimalSeparator: '.', groupSeparator: ',', usdPerUnit: 0.128 },
  { code: 'TWD', symbol: 'NT$', decimals: 0, decimalSeparator: '.', groupSeparator: ',', usdPerUnit: 0.031 },
  { code: 'KWD', symbol: 'KD', decimals: 3, decimalSeparator: '.', groupSeparator: ',', usdPerUnit: 3.25 },
];

export const CURRENCIES: Record<string, CurrencyDef> = Object.fromEntries(
  DATA.map((currency) => [currency.code, currency]),
);


interface SymbolDef {
  symbol: string;
  code?: string;
  byLanguage?: Record<string, string>;
}

const SYMBOLS: SymbolDef[] = [
  { symbol: 'US$', code: 'USD' },
  { symbol: 'A$', code: 'AUD' },
  { symbol: 'C$', code: 'CAD' },
  { symbol: 'S$', code: 'SGD' },
  { symbol: 'HK$', code: 'HKD' },
  { symbol: 'NT$', code: 'TWD' },
  { symbol: 'NZ$', code: 'NZD' },
  { symbol: 'MX$', code: 'MXN' },
  { symbol: 'R$', code: 'BRL' },
  { symbol: 'Rp.', code: 'IDR' },
  { symbol: 'Rp', code: 'IDR' },
  { symbol: 'RM', code: 'MYR' },
  { symbol: 'CHF', code: 'CHF' },
  { symbol: 'zł', code: 'PLN' },
  { symbol: 'Kč', code: 'CZK' },
  { symbol: 'Ft', code: 'HUF' },
  { symbol: 'lei', code: 'RON' },
  {
    symbol: 'kr',
    code: 'SEK',
    byLanguage: { sv: 'SEK', nb: 'NOK', nn: 'NOK', da: 'DKK' },
  },
  { symbol: 'Rs.', code: 'INR' },
  { symbol: 'Rs', code: 'INR' },
  { symbol: 'руб', code: 'RUB' },
  { symbol: 'TL', code: 'TRY' },
  { symbol: 'RMB', code: 'CNY' },
  { symbol: '円', code: 'JPY' },
  { symbol: '元', code: 'CNY' },
  { symbol: '원', code: 'KRW' },
  { symbol: 'บาท', code: 'THB' },
  { symbol: 'đ', code: 'VND' },
  { symbol: '￥', code: 'JPY', byLanguage: { ja: 'JPY', zh: 'CNY' } },
  { symbol: '¥', code: 'JPY', byLanguage: { ja: 'JPY', zh: 'CNY' } },
  { symbol: '₩', code: 'KRW' },
  { symbol: '₹', code: 'INR' },
  { symbol: '฿', code: 'THB' },
  { symbol: '₫', code: 'VND' },
  { symbol: '₽', code: 'RUB' },
  { symbol: '₺', code: 'TRY' },
  { symbol: '₪', code: 'ILS' },
  { symbol: '₱', code: 'PHP' },
  { symbol: 'د.إ', code: 'AED' },
  { symbol: 'ر.س', code: 'SAR' },
  { symbol: '£', code: 'GBP' },
  { symbol: '€', code: 'EUR' },
  { symbol: '$', code: 'USD' },
];

const NUMBER_PATTERN = '\\d(?:[\\d.,\\t ]*\\d)?';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeLanguage(sourceLanguage: string): string {
  return sourceLanguage.toLowerCase().split('-')[0] ?? '';
}

export interface DetectedPrice {
  raw: string;
  amount: number;
  currency: string;
  start: number;
  end: number;
}

export function parseAmount(raw: string, currency: CurrencyDef): number {
  const value = raw.replace(/[^\d.,]/g, '');
  if (!value) {
    return Number.NaN;
  }

  const lastDot = value.lastIndexOf('.');
  const lastComma = value.lastIndexOf(',');
  let decimalAt = -1;

  if (lastDot >= 0 && lastComma >= 0) {
    decimalAt = Math.max(lastDot, lastComma);
  } else if (lastDot >= 0 || lastComma >= 0) {
    const at = Math.max(lastDot, lastComma);
    const digitsAfter = value.length - at - 1;
    if (digitsAfter > 0 && digitsAfter < 3) {
      decimalAt = at;
    } else if (digitsAfter === 3) {
      // A lone three-digit tail is a group separator for 0/2-decimal
      // currencies; it is a decimal only for 3-decimal currencies.
      decimalAt = currency.decimals === 3 ? at : -1;
    }
  }

  const integer = decimalAt >= 0 ? value.slice(0, decimalAt) : value;
  const fraction = decimalAt >= 0 ? value.slice(decimalAt + 1) : '';
  const normalized = `${integer.replace(/[^\d]/g, '')}.${fraction.replace(/[^\d]/g, '')}`;
  return Number(normalized);
}

export function detectPrices(
  text: string,
  sourceLanguage: string,
): DetectedPrice[] {
  const normalized = text.replace(/[\u00a0\u202f]/g, ' ');
  const language = normalizeLanguage(sourceLanguage);
  const found: DetectedPrice[] = [];

  const push = (
    raw: string,
    amountRaw: string,
    code: string | undefined,
    start: number,
  ) => {
    if (!code) {
      return;
    }
    const currency = CURRENCIES[code];
    if (!currency) {
      return;
    }
    const amount = parseAmount(amountRaw, currency);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) {
      return;
    }
    found.push({
      raw: raw.trim(),
      amount,
      currency: code,
      start,
      end: start + raw.length,
    });
  };

  const symbols = [...SYMBOLS].sort(
    (a, b) => b.symbol.length - a.symbol.length,
  );

  for (const def of symbols) {
    const code = def.byLanguage?.[language] ?? def.code;
    if (!code) {
      continue;
    }
    const symbol = escapeRegex(def.symbol);
    const prefix = new RegExp(
      `(${symbol})\\s?(${NUMBER_PATTERN})(?![\\d.,])`,
      'gi',
    );
    const suffix = new RegExp(
      `(${NUMBER_PATTERN})(?![\\d.,])\\s?(${symbol})`,
      'gi',
    );

    let match: RegExpExecArray | null;
    while ((match = prefix.exec(normalized)) !== null) {
      push(match[0] ?? '', match[2] ?? '', code, match.index);
    }
    while ((match = suffix.exec(normalized)) !== null) {
      push(match[0] ?? '', match[1] ?? '', code, match.index);
    }
  }

  const codes = Object.keys(CURRENCIES).join('|');
  const codePrefix = new RegExp(
    `\\b(${codes})\\b\\s?(${NUMBER_PATTERN})(?![\\d.,])`,
    'g',
  );
  const codeSuffix = new RegExp(
    `(${NUMBER_PATTERN})(?![\\d.,])\\s?\\b(${codes})\\b`,
    'g',
  );

  let match: RegExpExecArray | null;
  while ((match = codePrefix.exec(normalized)) !== null) {
    push(match[0] ?? '', match[2] ?? '', match[1] ?? '', match.index);
  }
  while ((match = codeSuffix.exec(normalized)) !== null) {
    push(match[0] ?? '', match[1] ?? '', match[2] ?? '', match.index);
  }

  found.sort(
    (a, b) => a.start - b.start || b.end - b.start - (a.end - a.start),
  );
  const result: DetectedPrice[] = [];
  for (const price of found) {
    if (result.some((other) => price.start < other.end && price.end > other.start)) {
      continue;
    }
    result.push(price);
  }
  return result;
}

export interface PriceConversion {
  raw: string;
  amount: number;
  source: string;
  target: string;
  converted: number;
  rate: number;
  start: number;
  end: number;
}

export function convert(
  amount: number,
  from: string,
  to: string,
): number | null {
  const source = CURRENCIES[from];
  const target = CURRENCIES[to];
  if (!source || !target) {
    return null;
  }
  return (amount * source.usdPerUnit) / target.usdPerUnit;
}

export function rateBetween(from: string, to: string): number | null {
  const source = CURRENCIES[from];
  const target = CURRENCIES[to];
  if (!source || !target) {
    return null;
  }
  return source.usdPerUnit / target.usdPerUnit;
}

export function priceConversions(
  text: string,
  sourceLanguage: string,
  targetCode: string,
): PriceConversion[] {
  const target = CURRENCIES[targetCode] ? targetCode : 'USD';
  return detectPrices(text, sourceLanguage)
    .map((price) => {
      const converted = convert(price.amount, price.currency, target);
      const rate = rateBetween(price.currency, target);
      if (converted === null || rate === null) {
        return null;
      }
      return {
        raw: price.raw,
        amount: price.amount,
        source: price.currency,
        target,
        converted,
        rate,
        start: price.start,
        end: price.end,
      };
    })
    .filter((price): price is PriceConversion => price !== null);
}

export function formatCurrency(
  amount: number,
  code: string,
  locale: string,
): string {
  const currency = CURRENCIES[code];
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: currency?.decimals ?? 2,
      minimumFractionDigits: currency?.decimals ?? 2,
    }).format(amount);
  } catch {
    const symbol = currency?.symbol ?? code;
    return `${symbol} ${amount.toFixed(currency?.decimals ?? 2)}`;
  }
}

export function formatRate(rate: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      maximumSignificantDigits: 4,
    }).format(rate);
  } catch {
    return rate.toPrecision(4);
  }
}
