import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { authConfigured, config } from './config'

function createAuthClient(): SupabaseClient | null {
  if (!authConfigured || config.supabaseKey.startsWith('sb_secret_')) return null
  try {
    const payload = config.supabaseKey.split('.')[1]
    if (payload) {
      try {
        const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
        if (claims.role === 'service_role') return null
      } catch { /* 공개 키 형식 검증은 SDK에 맡긴다. */ }
    }
    return createClient(config.supabaseUrl, config.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'saetgil:auth:v1' },
    })
  } catch { return null }
}

/** 공개 클라이언트 키만 사용하며, 사용자 metadata로 권한을 판단하지 않는다. */
export const authClient = createAuthClient()
