const LOCAL_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5174',
  'http://localhost:5175',
  'https://smart-knowledge-hub-frontend.vercel.app',
];
export function getAllowedOrigins(): string[] {
  const configured = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  for (const value of configured) {
    const url = new URL(value);
    if (url.origin !== value || !['http:', 'https:'].includes(url.protocol))
      throw new Error('CORS_ALLOWED_ORIGINS must contain exact HTTP origins');
  }
  const frontendUrl = process.env.FRONTEND_URL?.trim();
  if (frontendUrl) {
    const url = new URL(frontendUrl);
    if (!['http:', 'https:'].includes(url.protocol))
      throw new Error('FRONTEND_URL must be an HTTP URL');
    configured.push(url.origin);
  }
  return process.env.NODE_ENV === 'production'
    ? [...new Set(configured)]
    : [...new Set([...LOCAL_ORIGINS, ...configured])];
}
export const ALLOWED_ORIGINS = (
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void,
) => {
  callback(null, !origin || getAllowedOrigins().includes(origin));
};
