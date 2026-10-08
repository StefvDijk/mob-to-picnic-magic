/** Browser-safe contract for the first, non-AI import pass. */
export type ImportSourceKind = 'text' | 'url' | 'upload';
export type ImportStatus = 'queued' | 'running' | 'needs_review' | 'failed' | 'saved' | 'expired';

export interface ImportCandidate {
  title: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  baseServings: string | null;
  sections: string[];
  ingredients: { section: string | null; originalText: string }[];
  steps: string[];
  uncertainty: string[];
}

export interface ImportDto {
  id: string;
  sourceKind: ImportSourceKind;
  sourceUrl: string | null;
  sourceText: string | null;
  sourceLabel: string | null;
  status: ImportStatus;
  candidates: ImportCandidate[];
  uncertainties: string[];
  errorCode: string | null;
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
}
