import { expect, it } from 'vitest';
import { createDetailLoader } from './detailLoader';

it('overlaps three reads, deduplicates products and caps the entire request at twenty', async () => {
  const releases: Array<() => void> = [];
  const calls: string[] = [];
  let active = 0, peak = 0;
  const load = createDetailLoader(async id => {
    calls.push(id); active += 1; peak = Math.max(peak, active);
    await new Promise<void>(resolve => releases.push(resolve));
    active -= 1;
    return id;
  });
  const tasks = Array.from({length: 23}, (_, i) => load(String(i)));
  expect(load('0')).toBe(tasks[0]);
  expect(calls).toEqual(['0', '1', '2']);
  // Release each wave explicitly, without measuring unreliable wall-clock timing.
  while (calls.length < 20 || active) {
    releases.splice(0).forEach(release => release());
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  }
  const results = await Promise.all(tasks);
  expect(peak).toBe(3);
  expect(calls).toHaveLength(20);
  expect(results.slice(20)).toEqual([undefined, undefined, undefined]);
});

it('releases a slot after failure and does not retry the failed product', async () => {
  let count = 0;
  const load = createDetailLoader(async id => { count += 1; if (id === 'bad') throw new Error('read failed'); return id; });
  expect(await load('bad')).toBeUndefined();
  expect(await load('bad')).toBeUndefined();
  expect(await load('good')).toBe('good');
  expect(count).toBe(2);
});
