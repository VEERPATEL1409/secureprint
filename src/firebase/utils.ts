/**
 * Recursively removes properties with undefined values so that Firestore
 * doesn't reject operations with "Unsupported field value: undefined".
 */
export function removeUndefinedFields<T extends Record<string, any>>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) =>
      typeof item === 'object' && item !== null ? removeUndefinedFields(item) : item
    ) as unknown as T;
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (
        value !== null &&
        typeof value === 'object' &&
        !(value instanceof Date) &&
        !('_methodName' in value) && // Firestore FieldValue (serverTimestamp, deleteField)
        !('toMillis' in value)
      ) {
        result[key] = removeUndefinedFields(value);
      } else {
        result[key] = value;
      }
    }
  }
  return result as T;
}
