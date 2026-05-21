export function assertUserApproved(action: string, approved: boolean): void {
  if (!approved) {
    throw new Error(`${action} requires explicit user approval.`);
  }
}

export function blockPrivateConsoleValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  return '[private value redacted]';
}
