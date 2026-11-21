import { describe, expect, it } from 'vitest';

import { imageFitRect, mapBlockRect } from './geometry';

describe('imageFitRect', () => {
  it('letterboxes a 4:3 image inside a square with contain', () => {
    expect(
      imageFitRect({ width: 400, height: 300 }, { width: 300, height: 300 }, 'contain'),
    ).toEqual({ x: 0, y: 37.5, width: 300, height: 225 });
  });

  it('center-crops a 4:3 image inside a square with cover', () => {
    expect(
      imageFitRect({ width: 400, height: 300 }, { width: 300, height: 300 }, 'cover'),
    ).toEqual({ x: -50, y: 0, width: 400, height: 300 });
  });

  it('handles a portrait frame inside a portrait screen', () => {
    expect(
      imageFitRect(
        { width: 720, height: 1280 },
        { width: 390, height: 844 },
        'contain',
      ),
    ).toEqual({
      x: 0,
      y: 75.33333333333337,
      width: 390,
      height: 693.3333333333333,
    });
  });

  it('collapses when the image has no dimensions', () => {
    expect(
      imageFitRect({ width: 0, height: 1280 }, { width: 390, height: 844 }),
    ).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe('mapBlockRect', () => {
  it('maps normalized Vision coordinates into the fitted image rect', () => {
    const imageRect = { x: 10, y: 50, width: 200, height: 400 };
    expect(
      mapBlockRect({ x: 0.5, y: 0.25, width: 0.25, height: 0.1 }, imageRect),
    ).toEqual({ x: 110, y: 150, width: 50, height: 40 });
  });
});
