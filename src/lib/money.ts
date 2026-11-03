/** USD display for UI. Always includes thousands separators and two decimal places. */
export function formatMoney(cents: number): string {
  const value = Number(cents);
  if (!Number.isFinite(value)) {
    return (0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }
  return (value / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
