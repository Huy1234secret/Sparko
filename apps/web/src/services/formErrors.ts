import type { FieldPath, FieldValues, UseFormReturn } from 'react-hook-form';
import { ApiError, type ApiFieldError } from './http';

/**
 * Attach server-side field errors to the matching form controls.
 * Paths that do not correspond to a value in the form are returned so the
 * caller can show them in a summary instead of silently dropping them.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  error: unknown,
): ApiFieldError[] {
  if (!(error instanceof ApiError)) return [];
  const unmatched: ApiFieldError[] = [];
  let focused = false;
  for (const fieldError of error.fieldErrors) {
    const path = fieldError.path as FieldPath<T>;
    if (fieldError.path && form.getValues(path) !== undefined) {
      form.setError(
        path,
        { type: 'server', message: fieldError.message },
        { shouldFocus: !focused },
      );
      focused = true;
    } else unmatched.push(fieldError);
  }
  return unmatched;
}
