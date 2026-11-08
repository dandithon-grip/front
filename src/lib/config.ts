const env = import.meta.env
export const config = {
  apiUrl: (env.VITE_API_BASE_URL || 'https://server-production-f8be.up.railway.app').replace(/\/$/, ''),
  supabaseUrl: env.VITE_SUPABASE_URL || '',
  supabaseKey: env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '',
  kakaoKey: env.VITE_KAKAO_JAVASCRIPT_KEY || '',
  mapTileUrl: env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  mapAttribution: env.VITE_MAP_ATTRIBUTION || '© OpenStreetMap contributors',
  recordBucket: env.VITE_SUPABASE_RECORD_BUCKET || 'records',
  firebase: {
    apiKey: env.VITE_FIREBASE_API_KEY || '',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: env.VITE_FIREBASE_APP_ID || '',
  },
  firebaseVapidKey: env.VITE_FIREBASE_VAPID_KEY || '',
}
export const authConfigured = Boolean(config.supabaseUrl && config.supabaseKey)
