export function getQrRewardCodeFromRouteParams(params: unknown) {
  if (!params || typeof params !== 'object') {
    return null;
  }

  const qrCode = (params as {qrCode?: unknown}).qrCode;
  if (typeof qrCode !== 'string') {
    return null;
  }

  try {
    const decoded = decodeURIComponent(qrCode).trim();
    return decoded || null;
  } catch {
    const fallback = qrCode.trim();
    return fallback || null;
  }
}
