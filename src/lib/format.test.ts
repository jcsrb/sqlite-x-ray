import { describe, it, expect } from 'vitest';
import { formatCell, percent } from './format';

describe('formatCell', () => {
  it('shows stored numbers exactly', () => {
    expect(formatCell(0.00012)).toBe('0.00012');
    expect(formatCell(1.23456)).toBe('1.23456');
    expect(formatCell(2024)).toBe('2024');
  });
  it('renders null and blobs', () => {
    expect(formatCell(null)).toBe('∅');
    expect(formatCell(new Uint8Array(3))).toBe('‹blob 3B›');
  });
});

describe('percent', () => {
  it('never rounds a non-zero fraction to 0% or a partial one to 100%', () => {
    expect(percent(0.001)).toBe('<1%');
    expect(percent(0.999)).toBe('>99%');
    expect(percent(1)).toBe('100%');
    expect(percent(0)).toBe('0%');
  });
});
