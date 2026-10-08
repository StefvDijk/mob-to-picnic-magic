import type { AuthEnv } from './auth';
import { processImportTask } from './imports/processor';

function isImportMessage(body: unknown): body is { kind: 'import'; taskId: string; version: 1 } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const message = body as Record<string, unknown>;
  return message.kind === 'import' && message.version === 1 &&
    typeof message.taskId === 'string' && message.taskId.length > 0 && message.taskId.length <= 128;
}

/** Acknowledgement follows durable processing; unsupported jobs remain visible through retries/DLQ. */
export async function handleQueue(batch: MessageBatch<unknown>, env: AuthEnv): Promise<void> {
  const suffix = env.APP_ENV === 'development' ? 'local' : env.APP_ENV;
  for (const message of batch.messages) {
    try {
      if (batch.queue !== `picnic-imports-${suffix}` || !isImportMessage(message.body)) {
        message.retry({ delaySeconds: 60 });
        continue;
      }
      const outcome = await processImportTask(env, message.body.taskId, message.body.version);
      if (outcome === 'busy' || outcome === 'blocked') message.retry({ delaySeconds: 60 });
      else message.ack();
    } catch {
      // No body or provider error is logged: job IDs can be inspected in the durable database.
      message.retry({ delaySeconds: 60 });
    }
  }
}
