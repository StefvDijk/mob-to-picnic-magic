type ImportStatus = 'queued' | 'running' | 'needs_review' | 'failed' | 'saved' | 'expired';

const activeRecognitionStates = ['pending', 'counting', 'reserved', 'sending'];

export function isImportKnownTerminal(
  status: ImportStatus,
  expiresAt: number | null,
  now = Date.now(),
): boolean {
  return status === 'failed' || status === 'expired' || (expiresAt !== null && expiresAt <= now);
}

export function isImportStillProcessing(
  status: ImportStatus,
  recognitionState: string | undefined,
  sourceAvailable: boolean,
): boolean {
  if (status === 'failed' || status === 'expired' || !sourceAvailable) return false;
  return status === 'queued' || status === 'running' || activeRecognitionStates.includes(recognitionState ?? '');
}
