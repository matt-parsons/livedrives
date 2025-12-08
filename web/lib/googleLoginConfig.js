const GOOGLE_LOGIN_ID_KEYS = [
  'GOOGLE_LOGIN_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_ID',
  'NEXT_PUBLIC_GOOGLE_LOGIN_OAUTH_CLIENT_ID',
  'NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID'
];

const GOOGLE_LOGIN_SECRET_KEYS = [
  'GOOGLE_LOGIN_OAUTH_CLIENT_SECRET',
  'GOOGLE_OAUTH_CLIENT_SECRET'
];

const GOOGLE_LOGIN_REDIRECT_KEYS = [
  'GOOGLE_LOGIN_OAUTH_REDIRECT_URI',
  'GOOGLE_OAUTH_REDIRECT_URI'
];

function resolveEnv(keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  return '';
}

export function getGoogleLoginConfig(request) {
  const { origin } = new URL(request.url);

  const clientId = resolveEnv(GOOGLE_LOGIN_ID_KEYS);
  const clientSecret = resolveEnv(GOOGLE_LOGIN_SECRET_KEYS);
  const envRedirectUri = resolveEnv(GOOGLE_LOGIN_REDIRECT_KEYS);
  const redirectUri = envRedirectUri || new URL('/api/auth/google/callback', origin).toString();

  return {
    clientId,
    clientSecret,
    redirectUri,
    firebaseApiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
    appPublicUrl: process.env.APP_PUBLIC_URL,
    requestOrigin: origin
  };
}
