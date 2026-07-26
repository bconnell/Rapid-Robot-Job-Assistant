import type { FillPreviewItem, FillResult } from '../models/FieldMapping';
import { getManualOnlyReason } from './ProfileValueResolver';

export function approveSafeHighConfidence(items: FillPreviewItem[]): FillPreviewItem[] {
  return items.map((item) => {
    const safe =
      item.confidence >= 0.9 &&
      item.fillable &&
      !item.sensitive &&
      item.candidate.visible &&
      !item.candidate.disabled &&
      !item.candidate.readOnly &&
      item.candidate.stableSelector !== false &&
      item.status !== 'manual-only' &&
      !getManualOnlyReason(item) &&
      Boolean(item.value?.trim());
    return safe ? { ...item, approved: true, rejected: false, status: 'approved' } : item;
  });
}

export function clearApprovals(items: FillPreviewItem[]): FillPreviewItem[] {
  return items.map((item) => ({
    ...item,
    approved: false,
    status:
      item.status === 'filled' || item.status === 'failed'
        ? item.status
        : item.status === 'manual-only'
          ? 'manual-only'
          : item.value?.trim()
            ? 'pending'
            : 'rejected',
    rejected: item.status === 'manual-only' ? item.rejected : !item.value?.trim()
  }));
}

export function invalidateApprovals(items: FillPreviewItem[]): FillPreviewItem[] {
  return items.map((item) => ({
    ...item,
    approved: false,
    rejected: item.status === 'manual-only' ? item.rejected : !item.value?.trim(),
    status:
      item.status === 'manual-only' ? 'manual-only' : item.value?.trim() ? 'pending' : 'rejected'
  }));
}

export function isCompleteApprovedFill(preview: FillPreviewItem[], results: FillResult[]): boolean {
  const approved = preview.filter((item) => item.approved);
  if (!approved.length || results.length !== approved.length) return false;

  const successful = new Map(
    results.filter((result) => result.ok).map((result) => [result.selector, result])
  );
  return approved.every((item) => successful.has(item.candidate.selector));
}
