import { describe, expect, it } from 'vitest';

import {
  CURRENCIES,
  convert,
  detectPrices,
  parseAmount,
  priceConversions,
  rateBetween,
} from './currency';

const def = (code: string) => CURRENCIES[code]!;

describe('parseAmount', () => {
  it('reads European and US grouping', () => {
    expect(parseAmount('1.234,56', def('EUR'))).toBe(1234.56);
    expect(parseAmount('1,234.56', def('USD'))).toBe(1234.56);
    expect(parseAmount('1.234.567,89', def('EUR'))).toBe(1234567.89);
    expect(parseAmount('1,234,567.89', def('USD'))).toBe(1234567.89);
  });

  it('treats a lone three-digit tail as grouping for normal currencies', () => {
    expect(parseAmount('25.000', def('IDR'))).toBe(25000);
    expect(parseAmount('1,200', def('USD'))).toBe(1200);
    expect(parseAmount('1.200', def('EUR'))).toBe(1200);
    expect(parseAmount('1,200', def('JPY'))).toBe(1200);
  });

  it('keeps real decimals', () => {
    expect(parseAmount('12,50', def('EUR'))).toBe(12.5);
    expect(parseAmount('12.99', def('USD'))).toBe(12.99);
    expect(parseAmount('3,5', def('EUR'))).toBe(3.5);
    expect(parseAmount('1.234', def('KWD'))).toBe(1.234);
  });
});

describe('detectPrices', () => {
  const first = (text: string, language = 'en') => detectPrices(text, language)[0];

  it('detects symbol prefix and suffix forms', () => {
    expect(first('Kaffee 3,50 €')).toMatchObject({
      amount: 3.5,
      currency: 'EUR',
    });
    expect(first('€12,50')).toMatchObject({ amount: 12.5, currency: 'EUR' });
    expect(first('$12.99')).toMatchObject({ amount: 12.99, currency: 'USD' });
    expect(first('12.99 USD')).toMatchObject({ amount: 12.99, currency: 'USD' });
    expect(first('US$ 5')).toMatchObject({ amount: 5, currency: 'USD' });
    expect(first('S$ 4.50')).toMatchObject({ amount: 4.5, currency: 'SGD' });
    expect(first('₹1,200')).toMatchObject({ amount: 1200, currency: 'INR' });
    expect(first('Rp 25.000')).toMatchObject({
      amount: 25000,
      currency: 'IDR',
    });
    expect(first('Rp. 25.000')).toMatchObject({
      amount: 25000,
      currency: 'IDR',
    });
    expect(first('1.200,50 €')).toMatchObject({
      amount: 1200.5,
      currency: 'EUR',
    });
    expect(first('CHF 1.234,50')).toMatchObject({
      amount: 1234.5,
      currency: 'CHF',
    });
    expect(first('R$ 12,50')).toMatchObject({ amount: 12.5, currency: 'BRL' });
    expect(first('50 lei')).toMatchObject({ amount: 50, currency: 'RON' });
  });

  it('resolves ambiguous yen and krone by source language', () => {
    expect(first('¥1,200', 'ja')).toMatchObject({
      amount: 1200,
      currency: 'JPY',
    });
    expect(first('¥1,200', 'zh')).toMatchObject({
      amount: 1200,
      currency: 'CNY',
    });
    expect(first('kr 99', 'sv')).toMatchObject({
      amount: 99,
      currency: 'SEK',
    });
    expect(first('kr 99', 'da')).toMatchObject({
      amount: 99,
      currency: 'DKK',
    });
  });

  it('ignores bare numbers, times and dates', () => {
    expect(detectPrices('Be- und Entladen frei Mo-Fr 7.30-17', 'de')).toEqual(
      [],
    );
    expect(detectPrices('Room 12.50, gate 4', 'en')).toEqual([]);
    expect(detectPrices('2026-11-22', 'en')).toEqual([]);
  });
});

describe('conversion', () => {
  it('converts through the USD table', () => {
    expect(convert(10, 'EUR', 'USD')).toBeCloseTo(10.9);
    expect(convert(100000, 'IDR', 'USD')).toBeCloseTo(6.2);
    expect(convert(10, 'USD', 'IDR')).toBeCloseTo(161290.32, 0);
    expect(rateBetween('EUR', 'USD')).toBeCloseTo(1.09);
  });

  it('returns null for unknown currencies', () => {
    expect(convert(1, 'XXX', 'USD')).toBeNull();
    expect(rateBetween('USD', 'XXX')).toBeNull();
  });

  it('produces display rows with the target currency', () => {
    const rows = priceConversions('Kaffee 3,50 €', 'de', 'USD');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      raw: '3,50 €',
      source: 'EUR',
      target: 'USD',
      amount: 3.5,
    });
    expect(rows[0]?.converted).toBeCloseTo(3.815);
    expect(rows[0]?.rate).toBeCloseTo(1.09);
  });
});

describe('won detection', () => {
  it('matches only a whole-word won suffix', () => {
    const rows = detectPrices('3,500 won', 'ko');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      raw: '3,500 won',
      amount: 3500,
      currency: 'KRW',
      start: 0,
      end: 9,
    });
  });

  it('does not treat English prose as KRW', () => {
    expect(detectPrices('We won 3 games', 'ko')).toHaveLength(0);
    expect(detectPrices('40 wonderful dishes', 'ko')).toHaveLength(0);
    expect(detectPrices('12 500 won', 'ko')[0]?.amount).toBe(12500);
    expect(detectPrices('1 000 won', 'ko')[0]?.amount).toBe(1000);
    expect(detectPrices('Set 2 3,500 won', 'ko')[0]?.amount).toBe(3500);
  });

  it('finds the run-on translation prices exactly', () => {
    const rows = detectPrices(
      'tteokbokki deokbokki 3,500 won Sundae 4,500 won 6,000 fish cake gimbap 2,500 won 1/2,000 won',
      'ko',
    );
    expect(rows.map((row) => row.raw)).toEqual([
      '3,500 won',
      '4,500 won',
      '2,500 won',
      '2,000 won',
    ]);
  });

  it('converts KRW to SGD through USD', () => {
    expect(convert(3500, 'KRW', 'SGD')).toBeCloseTo(3.3, 1);
  });
});
