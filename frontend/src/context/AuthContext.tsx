import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { getCurrentUser, setAuthToken } from '../lib/api';
import type { User } from '../types/user';

export type { User } from '../types/user';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string, fullName: string, phoneNumber?: string) => Promise<User>;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_STORAGE_KEY = 'barakahfund_token';
const LEGACY_TOKEN_KEY = 'gambiafund_token';
/** Legacy: user profile is no longer persisted; remove on load. */
const USER_STORAGE_KEY_LEGACY = 'gambiafund_user';

function readStoredToken(): string | null {
  const current = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (current) {
    return current;
  }
  const migrated = localStorage.getItem(LEGACY_TOKEN_KEY);
  if (migrated) {
    localStorage.setItem(TOKEN_STORAGE_KEY, migrated);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    return migrated;
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = useCallback(() => {
    setUser(null);
    setToken(null);
    setAuthToken(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.removeItem(USER_STORAGE_KEY_LEGACY);
  }, []);

  // Restore session: token only, then /api/auth/me (user stays in memory)
  useEffect(() => {
    let cancelled = false;
    const storedToken = readStoredToken();
    localStorage.removeItem(USER_STORAGE_KEY_LEGACY);

    async function bootstrap() {
      if (!storedToken) {
        if (!cancelled) {
          setIsLoading(false);
        }
        return;
      }

      setToken(storedToken);
      setAuthToken(storedToken);
      try {
        const me = await getCurrentUser();
        if (!cancelled) {
          setUser(me);
        }
      } catch (error) {
        console.error('Session restore failed:', error);
        if (!cancelled) {
          clearSession();
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    const t = readStoredToken();
    if (!t) {
      return;
    }
    setAuthToken(t);
    const me = await getCurrentUser();
    setUser(me);
  }, []);

  const login = async (email: string, password: string): Promise<User> => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || ''}/api/auth/login`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Login failed');
      }

      const data = await response.json();
      setToken(data.token);
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      setAuthToken(data.token);
      const me = await getCurrentUser();
      setUser(me);
      return me;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (
    email: string,
    password: string,
    fullName: string,
    phoneNumber?: string
  ): Promise<User> => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || ''}/api/auth/register`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            fullName,
            phoneNumber
          })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Registration failed');
      }

      const data = await response.json();
      setToken(data.token);
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      setAuthToken(data.token);
      const me = await getCurrentUser();
      setUser(me);
      return me;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    clearSession();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user && !!token,
        login,
        register,
        refreshUser,
        logout
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
