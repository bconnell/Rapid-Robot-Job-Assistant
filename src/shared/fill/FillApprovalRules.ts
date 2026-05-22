import type { FillPreviewItem } from '../models/FieldMapping';

export function approveSafeHighConfidence(items: FillPreviewItem[]): FillPreviewItem[] {
  return items.map((item) => {
    const safe =
      item.confidence >= 0.9 &&
      !item.sensitive &&
      item.candidate.visible &&
      item.status !== 'manual-only' &&
      Boolean(item.value);
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
          : 'pending'
  }));
}
