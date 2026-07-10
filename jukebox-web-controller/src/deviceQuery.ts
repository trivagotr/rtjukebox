export function parseDeviceCodeFromSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  const value = params.has('device')
    ? params.get('device')
    : params.get('code');
  const trimmedValue = value?.trim();

  return trimmedValue || null;
}
