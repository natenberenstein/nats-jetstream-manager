'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { authApi } from '@/lib/api';
import { UserProfile } from '@/lib/types';

const TOKEN_KEY = 'nats_auth_token_v1';
const USER_KEY = 'nats_user_profile_v1';

interface AuthContextValue {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  updateProfile: (fullName?: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const persist = (nextToken: string | null, nextUser: UserProfile | null) => {
    setToken(nextToken);
    setUser(nextUser);
    if (typeof window === 'undefined') return;
    if (nextToken) localStorage.setItem(TOKEN_KEY, nextToken);
    else localStorage.removeItem(TOKEN_KEY);

    if (nextUser) localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    else localStorage.removeItem(USER_KEY);

    if (nextUser?.role) localStorage.setItem('nats_ui_role_v1', nextUser.role);
  };

  const refreshMe = useCallback(async () => {
    try {
      const me = await authApi.me();
      persist(token, me);
    } catch (err) {
      persist(null, null);
      throw err;
    }
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    const result = await authApi.login({ email, password });
    persist(result.token, result.user);
  }, []);

  const signup = useCallback(async (email: string, password: string, fullName?: string) => {
    setError(null);
    const result = await authApi.signup({ email, password, full_name: fullName });
    persist(result.token, result.user);
  }, []);

  const logout = useCallback(async () => {
    setError(null);
    try {
      await authApi.logout();
    } finally {
      persist(null, null);
    }
  }, []);

  const updateProfile = useCallback(
    async (fullName?: string | null) => {
      setError(null);
      const next = await authApi.updateProfile({ full_name: fullName });
      persist(token, next);
    },
    [token],
  );

  useEffect(() => {
    const bootstrap = async () => {
      if (typeof window === 'undefined') return;
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedUserRaw = localStorage.getItem(USER_KEY);
      const storedUser = storedUserRaw ? (JSON.parse(storedUserRaw) as UserProfile) : null;
      if (!storedToken) {
        setIsLoading(false);
        return;
      }
      setToken(storedToken);
      setUser(storedUser);

      try {
        const me = await authApi.me();
        persist(storedToken, me);
      } catch {
        persist(null, null);
      } finally {
        setIsLoading(false);
      }
    };

    void bootstrap();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: !!user && !!token,
      isLoading,
      error,
      login,
      signup,
      logout,
      refreshMe,
      updateProfile,
    }),
    [user, token, isLoading, error, login, signup, logout, refreshMe, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
