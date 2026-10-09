export class PlanDeadlineError extends Error { constructor() { super('PLAN_DEADLINE_EXCEEDED'); } }
/** One timer/abort signal for the whole read-only plan, including queued work. */
export function createPlanDeadline(deadlineAt: number) {
  const controller = new AbortController();
  const check = () => {
    if (Date.now() >= deadlineAt) controller.abort();
    if (controller.signal.aborted) throw new PlanDeadlineError();
  };
  const timer = setTimeout(() => controller.abort(), Math.max(0, deadlineAt - Date.now()));
  return {
    signal: controller.signal,
    check,
    async run<T>(operation: () => Promise<T>): Promise<T> {
      check();
      let abort!: () => void;
      const expired = new Promise<never>((_resolve, reject) => {
        abort = () => reject(new PlanDeadlineError());
        controller.signal.addEventListener('abort', abort, {once: true});
      });
      try { const result = await Promise.race([operation(), expired]); check(); return result; }
      finally { controller.signal.removeEventListener('abort', abort); }
    },
    dispose() { clearTimeout(timer); },
  };
}
