'use client';

import { create } from 'zustand';
import Cookies from 'js-cookie';
import type { UserWithChannel, Channel } from '@castify/types';
import type { LoginDto } from '@castify/validators';
import { api } from '@/lib/api';

interface AuthState {
  user: UserWithChannel | null;
  channel: Channel | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthActions {
  login: (dto: LoginDto) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  setUser: (user: UserWithChannel) => void;
}

export const useAuthStore = create<AuthState & AuthActions>((set) => ({
  user: null,
  channel: null,
  isLoading: false,
  isAuthenticated: false,

  login: async (dto: LoginDto) => {
    set({ isLoading: true });
    try {
      await api.auth.login(dto);
      const user = await api.auth.me();

      if (user.channel) {
        Cookies.set('castify_tenant', user.channel.slug, {
          expires: 30,
          sameSite: 'lax',
        });
        api.setTenant(user.channel.slug);
      }

      set({ user, channel: user.channel, isAuthenticated: true, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    await api.auth.logout();
    set({ user: null, channel: null, isAuthenticated: false, isLoading: false });
  },

  loadUser: async () => {
    const token = Cookies.get('castify_access_token');
    if (!token) {
      set({ isAuthenticated: false });
      return;
    }

    set({ isLoading: true });
    try {
      const user = await api.auth.me();
      if (user.channel) {
        api.setTenant(user.channel.slug);
      }
      set({ user, channel: user.channel, isAuthenticated: true, isLoading: false });
    } catch {
      set({ user: null, channel: null, isAuthenticated: false, isLoading: false });
    }
  },

  setUser: (user: UserWithChannel) => {
    set({ user, channel: user.channel, isAuthenticated: true });
  },
}));
