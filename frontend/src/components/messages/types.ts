export interface SavedView {
  name: string;
  query: Record<string, string>;
}

export type DiffCellType = 'equal' | 'added' | 'removed' | 'changed' | 'empty';

export interface DiffCell {
  text: string;
  type: DiffCellType;
}

export interface DiffRow {
  left: DiffCell;
  right: DiffCell;
}

export interface DiffSummary {
  equal: number;
  added: number;
  removed: number;
  changed: number;
}

export type DiffDisplayRow =
  | { kind: 'row'; row: DiffRow; originalIndex: number }
  | { kind: 'collapsed'; count: number };

export interface DiffWorkerRequest {
  id: number;
  mode: 'line' | 'json';
  left: string;
  right: string;
}

export interface DiffWorkerResponse {
  id: number;
  rows: DiffRow[];
  summary: DiffSummary;
  error?: string;
}
