import type { UserProfile } from '@openmsp/api-types';

export const SUPABASE_URL = (
  import.meta.env.VITE_SUPABASE_URL || 'https://hbewdpkyumcsultgebmj.supabase.co'
).replace(/\/$/, '');

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiZXdkcGt5dW1jc3VsdGdlYm1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMDk4NjgsImV4cCI6MjEwMTg4NTg2OH0.f2C9MQGsN5qAXiB3ONb2G4uCx4CnF_8ae3Q9a-tNF7M';

const SUPABASE_REFRESH_TOKEN_KEY = 'apexmsp_supabase_refresh_token';

export interface SupabaseAuthResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  user: {
    id: string;
    email?: string;
    app_metadata?: Record<string, any>;
    user_metadata?: Record<string, any>;
    created_at?: string;
  };
}

export function getStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(SUPABASE_REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredRefreshToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(SUPABASE_REFRESH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(SUPABASE_REFRESH_TOKEN_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function mapSupabaseUserToProfile(u: SupabaseAuthResponse['user']): UserProfile {
  const appMeta = u.app_metadata || {};
  const userMeta = u.user_metadata || {};
  return {
    id: u.id,
    email: u.email || 'brandon@apexmsp.com',
    name: userMeta.full_name || userMeta.name || 'Brandon Ray',
    role: (appMeta.role || 'owner') as UserProfile['role'],
    orgId: appMeta.org_id || userMeta.org_id || '00000000-0000-0000-0000-000000000001',
    orgName: userMeta.org_name || 'ApexMSP',
    createdAt: u.created_at || new Date().toISOString()
  };
}

export const supabaseAuth = {
  /**
   * Direct Supabase GoTrue password sign-in (`POST /auth/v1/token?grant_type=password`)
   */
  async signInWithPassword(email: string, password: string): Promise<{ token: string; refreshToken?: string; user: UserProfile }> {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password
      })
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as Record<string, any>;
      throw new Error(
        errBody.error_description || errBody.msg || errBody.error || 'Invalid Supabase email or password'
      );
    }

    const data = (await res.json()) as SupabaseAuthResponse;
    if (data.refresh_token) {
      setStoredRefreshToken(data.refresh_token);
    }

    return {
      token: data.access_token,
      refreshToken: data.refresh_token,
      user: mapSupabaseUserToProfile(data.user)
    };
  },

  /**
   * Request a Supabase Magic Link / OTP email (`POST /auth/v1/otp`)
   */
  async signInWithOtp(email: string): Promise<{ message: string }> {
    const redirectTo = typeof window !== 'undefined' ? window.location.origin : 'https://apexmsp.app';
    const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        create_user: false,
        options: {
          emailRedirectTo: redirectTo
        }
      })
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as Record<string, any>;
      throw new Error(
        errBody.error_description || errBody.msg || errBody.error || 'Failed to send Supabase Magic Link'
      );
    }

    return {
      message: `Supabase Magic Link sent to ${email.trim().toLowerCase()}. Check your inbox to sign in.`
    };
  },

  /**
   * Refresh an expiring Supabase access token using the stored refresh token
   */
  async refreshSession(): Promise<{ token: string; user: UserProfile } | null> {
    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) return null;

    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refresh_token: refreshToken })
      });

      if (!res.ok) {
        setStoredRefreshToken(null);
        return null;
      }

      const data = (await res.json()) as SupabaseAuthResponse;
      if (data.refresh_token) {
        setStoredRefreshToken(data.refresh_token);
      }

      return {
        token: data.access_token,
        user: mapSupabaseUserToProfile(data.user)
      };
    } catch {
      return null;
    }
  },

  /**
   * Parse `#access_token=...&refresh_token=...` callback hash from Supabase Magic Link redirect
   */
  consumeHashSession(): { accessToken: string; refreshToken?: string } | null {
    if (typeof window === 'undefined' || !window.location.hash) return null;
    const hash = window.location.hash.substring(1);
    if (!hash.includes('access_token=')) return null;

    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token') || undefined;
    if (!accessToken) return null;

    if (refreshToken) {
      setStoredRefreshToken(refreshToken);
    }

    try {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch {
      // ignore history replace errors
    }

    return { accessToken, refreshToken };
  },

  /**
   * Sign out of Supabase Auth (`POST /auth/v1/logout`)
   */
  async signOut(accessToken?: string | null): Promise<void> {
    setStoredRefreshToken(null);
    if (!accessToken) return;
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`
        }
      });
    } catch {
      // ignore network error on signout
    }
  }
};
