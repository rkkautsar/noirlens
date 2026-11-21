import { getLocales } from 'expo-localization';

import { CURRENCIES } from './currency';

const REGION_CURRENCY: Record<string, string> = {
  US: 'USD',
  GB: 'GBP',
  DE: 'EUR',
  FR: 'EUR',
  ES: 'EUR',
  IT: 'EUR',
  NL: 'EUR',
  PT: 'EUR',
  IE: 'EUR',
  AT: 'EUR',
  BE: 'EUR',
  FI: 'EUR',
  GR: 'EUR',
  JP: 'JPY',
  CN: 'CNY',
  KR: 'KRW',
  ID: 'IDR',
  TH: 'THB',
  VN: 'VND',
  SG: 'SGD',
  MY: 'MYR',
  PH: 'PHP',
  IN: 'INR',
  AU: 'AUD',
  CA: 'CAD',
  CH: 'CHF',
  SE: 'SEK',
  NO: 'NOK',
  DK: 'DKK',
  PL: 'PLN',
  CZ: 'CZK',
  HU: 'HUF',
  RO: 'RON',
  TR: 'TRY',
  BR: 'BRL',
  MX: 'MXN',
  ZA: 'ZAR',
  AE: 'AED',
  SA: 'SAR',
  IL: 'ILS',
  RU: 'RUB',
  NZ: 'NZD',
  HK: 'HKD',
  TW: 'TWD',
};

export interface PreferredCurrency {
  code: string;
  locale: string;
}

/**
 * The phone's regional currency, falling back to USD when iOS reports no
 * currency or one this build does not know.
 */
export function preferredCurrency(): PreferredCurrency {
  const locale = getLocales()[0];
  const reported = locale?.currencyCode?.toUpperCase();
  const region = locale?.regionCode?.toUpperCase();
  const code =
    reported && CURRENCIES[reported]
      ? reported
      : region && REGION_CURRENCY[region]
        ? REGION_CURRENCY[region]
        : 'USD';
  return {
    code,
    locale: locale?.languageTag ?? 'en-US',
  };
}
