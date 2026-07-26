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
  const approvedSelectors = preview
    .filter((item) => item.approved)
    .map((item) => item.candidate.selector);
  if (!approvedSelectors.length || results.length !== approvedSelectors.length) return false;

  const resultSelectors = results.map((result) => result.selector);
  if (new Set(resultSelectors).size !== resultSelectors.length) return false;
  if (results.some((result) => !result.ok)) return false;

  const approved = new Set(approvedSelectors);
  return resultSelectors.every((selector) => approved.has(selector));
}
