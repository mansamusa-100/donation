import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { api, getCurrentUser } from '../lib/api';
import type { User } from '../types/user';

export type { User } from '../types/user';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<User>;
  loginWithGoogle: (credential: string) => Promise<User>;
  register: (email: string, password: string, fullName: string, phoneNumber?: string) => Promise<User>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LEGACY_TOKEN_KEY = 'barakahfund_token';
const LEGACY_TOKEN_KEY_OLD = 'gambiafund_token';
const USER_STORAGE_KEY_LEGACY = 'gambiafund_user';

function clearLegacyTokenStorage() {
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY_OLD);
  localStorage.removeItem(USER_STORAGE_KEY_LEGACY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = useCallback(() => {
    setUser(null);
    clearLegacyTokenStorage();
  }, []);

  useEffect(() => {
    let cancelled = false;
    clearLegacyTokenStorage();

    async function bootstrap() {
      try {
        const me = await getCurrentUser();
        if (!cancelled) {
          setUser(me);
        }
      } catch {
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
    const me = await getCurrentUser();
    setUser(me);
  }, []);

  const login = async (email: string, password: string): Promise<User> => {
    setIsLoading(true);
    try {
      await api.login(email, password);
      const me = await getCurrentUser();
      setUser(me);
      return me;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async (credential: string): Promise<User> => {
    setIsLoading(true);
    try {
      await api.loginWithGoogle(credential);
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
      await api.register(email, password, fullName, phoneNumber);
      const me = await getCurrentUser();
      setUser(me);
      return me;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // Clear local state even if the network call fails.
    }
    clearSession();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        loginWithGoogle,
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
