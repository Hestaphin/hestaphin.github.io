export function taskRecurrence(mode, every = 1) {
  if (mode === 'none' || !mode) return null;
  if (mode === 'daily') return { unit: 'days', every: 1 };
  const n = Number(every);
  if (!['hours', 'days'].includes(mode) || !Number.isSafeInteger(n) || n < 1 || n > (mode === 'hours' ? 8760 : 3650)) throw Error('Choose a whole-number repeat interval within the allowed range.');
  return { unit: mode, every: n };
}
export function recurrenceLabel(series) {
  const tr = value => globalThis.window?.COPKU_I18N?.translate(value) || value;
  if (!series) return tr('Recurring reminder');
  return series.repeat_unit === 'days' && series.repeat_every === 1 ? tr('Every day') : `${tr('Every')} ${series.repeat_every} ${tr(series.repeat_unit)}`;
}
