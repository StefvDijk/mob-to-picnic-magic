export class WorkflowTimeoutError extends Error {
  constructor() { super('Workflow deadline exceeded'); this.name = 'WorkflowTimeoutError'; }
}
/** Also bounds injected providers that ignore cancellation; real fetch receives the signal. */
export async function beforeDeadline<T>(deadlineAt: number, run: (signal: AbortSignal) => Promise<T>, now = Date.now): Promise<T> {
  const remaining = deadlineAt - now();
  if (remaining <= 0) throw new WorkflowTimeoutError();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => { if (controller.signal.aborted) throw new WorkflowTimeoutError(); return run(controller.signal); }),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new WorkflowTimeoutError()); }, remaining); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
