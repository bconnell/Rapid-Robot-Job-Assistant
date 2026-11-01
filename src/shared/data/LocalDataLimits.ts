// The byte bound caps text and serialized payload allocation; this independent
// count bound also limits per-record validation and IndexedDB request work for
// backups containing many very small objects.
export const maxBackupBytes = 16 * 1024 * 1024;
export const maxRecordsPerCollection = 5000;
