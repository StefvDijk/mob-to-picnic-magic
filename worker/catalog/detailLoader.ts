/** Request-local bounded reads. Failed reads are retained to prevent accidental retries. */
export function createDetailLoader<T>(read: (id: string) => Promise<T | undefined>) {
  const pending = new Map<string, Promise<T | undefined>>();
  const waiting: Array<() => void> = [];
  let active = 0;
  return (id: string): Promise<T | undefined> => {
    const existing = pending.get(id);
    if (existing) return existing;
    if (pending.size >= 20) return Promise.resolve(undefined);
    const task = (async () => {
      if (active >= 3) await new Promise<void>(resolve => waiting.push(resolve));
      else active += 1;
      try { return await read(id); }
      catch { return undefined; }
      finally {
        const next = waiting.shift();
        if (next) next();
        else active -= 1;
      }
    })();
    pending.set(id, task);
    return task;
  };
}
