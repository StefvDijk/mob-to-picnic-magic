import { describe, expect, it } from 'vitest';
import { isImportKnownTerminal, isImportStillProcessing } from '../src/lib/import-state';

describe('import presentation state', () => {
  it('shows a terminal failure even if recognition is still marked pending', () => {
    expect(isImportStillProcessing('failed', 'pending', true)).toBe(false);
  });

  it('does not keep an expired source in the processing state', () => {
    expect(isImportStillProcessing('running', 'pending', false)).toBe(false);
  });

  it('recognizes a persisted terminal result before a deadline timeout', () => {
    expect(isImportKnownTerminal('failed', null)).toBe(true);
    expect(isImportKnownTerminal('running', 1_000, 1_000)).toBe(true);
  });

  it('keeps active server work in progress', () => {
    expect(isImportStillProcessing('running', 'pending', true)).toBe(true);
    expect(isImportStillProcessing('queued', 'unknown', true)).toBe(true);
  });
});
