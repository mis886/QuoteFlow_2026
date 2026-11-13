export interface ActionState {
  ok: boolean;
  error?: string;
  message?: string;
  /** one-time data to show (e.g. a temporary PIN) */
  secret?: { label: string; value: string };
  /** changes on every response so the UI can react even when the text repeats */
  n?: number;
}
