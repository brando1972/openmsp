import type { UserProfile } from '@openmsp/api-types';

const REFRESH_TOKEN_KEY = 'openmsp_refresh_token';
const LEGACY_REFRESH_TOKEN_KEY = 'apexmsp_supabase_refresh_token';

const resolveApiV1 = (): string => {
  if (import.meta.env.VITE_API_URL) {
    return `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api/v1`;
  }
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return 'https://api.apexmsp.app/api/v1';
  }
  return 'http://localhost:3001/api/v1';
};

export function getStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY) || localStorage.getItem(LEGACY_REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredRefreshToken(token: string | null): void {
  try {
    localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
    if (token) {
      localStorage.setItem(REFRESH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export const supabaseAuth = {
  /**
   * Request a one-time sign-in Magic Link via the Control Plane API (`POST /api/v1/auth/magic-link`)
   */
  async signInWithOtp(email: string): Promise<{ message: string }> {
    const redirectTo = typeof window !== 'undefined' ? window.location.origin : 'https://apexmsp.app';
    const res = await fetch(`${resolveApiV1()}/auth/magic-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        redirectTo
      })
    });

    const data = (await res.json().catch(() => ({}))) as Record<string, any>;
    if (!res.ok) {
      throw new Error(data.error || 'Unable to send sign-in link.');
    }

    return {
      message:
        data.message ||
        'If this email is registered to an authorized operator, a one-time sign-in link has been sent.'
    };
  },

  /**
   * Refresh an expiring session token server-side via the Control Plane API (`POST /api/v1/auth/refresh`)
   */
  async refreshSession(): Promise<{ token: string; user: UserProfile } | null> {
    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) return null;

    try {
      const res = await fetch(`${resolveApiV1()}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refreshToken })
      });

      if (!res.ok) {
        setStoredRefreshToken(null);
        return null;
      }

      const data = (await res.json()) as {
        token: string;
        refreshToken?: string;
        user: UserProfile;
      };
      if (data.refreshToken) {
        setStoredRefreshToken(data.refreshToken);
      }

      return {
        token: data.token,
        user: data.user
      };
    } catch {
      return null;
    }
  },

  /**
   * Parse `#access_token=...&refresh_token=...` callback hash from Magic Link redirect
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
   * Clear stored refresh token on sign out
   */
  async signOut(_accessToken?: string | null): Promise<void> {
    setStoredRefreshToken(null);
  }
};
