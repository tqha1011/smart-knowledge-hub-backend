const LOCAL_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5174',
  'http://localhost:5175',
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
  return process.env.NODE_ENV === 'production'
    ? configured
    : [...new Set([...LOCAL_ORIGINS, ...configured])];
}
export const ALLOWED_ORIGINS = (
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void,
) => {
  callback(null, !origin || getAllowedOrigins().includes(origin));
};
