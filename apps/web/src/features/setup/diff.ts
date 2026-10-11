/** One setting a setup preset changes, formatted for people. */
export type SettingChange = { setting: string; before: string; after: string };

const words = (key: string) =>
  key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\bids\b/g, 'IDs')
    .replace(/\bid\b/g, 'ID')
    .replace(/^./, (first) => first.toUpperCase());
export const featureLabel = (featureId: string) =>
  words(featureId.replaceAll('-', ' '));

function display(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Not set';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (Array.isArray(value))
    return value.length
      ? `${value.length} item${value.length === 1 ? '' : 's'}`
      : 'None';
  if (typeof value === 'object') return 'Custom settings';
  return String(value);
}

const unset = (value: unknown) => (value === '' ? null : (value ?? null));
/** Top-level settings whose value differs between two configurations. */
export function settingChanges(
  before: unknown,
  after: unknown,
): SettingChange[] {
  const from = (before ?? {}) as Record<string, unknown>;
  const to = (after ?? {}) as Record<string, unknown>;
  return [...new Set([...Object.keys(from), ...Object.keys(to)])]
    .filter(
      (key) =>
        JSON.stringify(unset(from[key])) !== JSON.stringify(unset(to[key])),
    )
    .map((key) => ({
      setting: words(key),
      before: display(from[key]),
      after: display(to[key]),
    }));
}
