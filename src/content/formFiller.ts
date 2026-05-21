import type { FillPreviewItem, FillResult } from '../shared/models/FieldMapping';

export function fillApprovedFields(
  preview: FillPreviewItem[],
  doc: Document = document
): FillResult[] {
  return preview.filter((item) => item.approved).map((item) => fillField(item, doc));
}

function fillField(item: FillPreviewItem, doc: Document): FillResult {
  if (!item.value) {
    return { selector: item.candidate.selector, ok: false, message: 'No value provided.' };
  }
  if (item.sensitive && !item.requiresDirectReview) {
    return {
      selector: item.candidate.selector,
      ok: false,
      message: 'Sensitive field was not directly reviewed.'
    };
  }

  const element = doc.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    item.candidate.selector
  );
  if (!element) {
    return { selector: item.candidate.selector, ok: false, message: 'Field not found.' };
  }

  if (element instanceof HTMLInputElement && element.type === 'file') {
    return {
      selector: item.candidate.selector,
      ok: false,
      message: 'File uploads require manual selection.'
    };
  }

  element.focus();
  element.value = item.value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));

  return { selector: item.candidate.selector, ok: true, message: 'Filled approved field.' };
}
