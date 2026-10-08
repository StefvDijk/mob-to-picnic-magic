export type ActionState = 'queued' | 'running' | 'partial' | 'succeeded' | 'stopped' | 'unknown' | 'resolved';
export type ExecutionLineState = 'unsent' | 'sending' | 'added' | 'not_added' | 'unknown' | 'skipped';

export interface ActionLineDto {
  id: string;
  purchaseLineId: string;
  productId: string;
  name: string;
  count: number;
  unitPriceCents: number;
  lineTotalCents: number;
  status: ExecutionLineState;
}

export interface ActionDto {
  id: string;
  approvalId: string;
  proposalId: string;
  state: ActionState;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  totalPriceCents: number;
  lines: ActionLineDto[];
}
