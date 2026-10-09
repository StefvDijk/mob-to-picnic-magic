import { expect, it } from 'vitest';
import { createPlanDeadline, PlanDeadlineError } from './planDeadline';

it('stops stalled reads with a shared abort signal and refuses new reads', async () => {
  const deadline = createPlanDeadline(Date.now() + 20);
  let calls = 0;
  try {
    await expect(deadline.run(() => { calls += 1; return new Promise(() => {}); })).rejects.toBeInstanceOf(PlanDeadlineError);
    expect(deadline.signal.aborted).toBe(true);
    await expect(deadline.run(async () => { calls += 1; })).rejects.toBeInstanceOf(PlanDeadlineError);
    expect(calls).toBe(1);
  } finally { deadline.dispose(); }
});

it('cleans up the deadline timer on a completed request', async () => {
  const deadline = createPlanDeadline(Date.now() + 10);
  expect(await deadline.run(async () => 'complete')).toBe('complete');
  deadline.dispose();
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(deadline.signal.aborted).toBe(false);
});
