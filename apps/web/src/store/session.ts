import { create } from 'zustand';
import { login, logout as logoutRequest, me, register, type PublicUser } from '../api/client.js';

interface SessionStore {
  ready: boolean;
  user: PublicUser | null;
  load: () => Promise<void>;
  signIn: (input: { email: string; password: string }) => Promise<void>;
  signUp: (input: { email: string; password: string; displayName?: string }) => Promise<void>;
  applyUser: (user: PublicUser) => void;
  logout: () => Promise<void>;
  clear: () => void;
}

export const useSession = create<SessionStore>()((set) => ({
  ready: false,
  user: null,

  load: async () => {
    try {
      const body = await me();
      set({ user: body.user, ready: true });
    } catch {
      set({ user: null, ready: true });
    }
  },

  signIn: async (input) => {
    const body = await login(input);
    set({ user: body.user, ready: true });
  },

  signUp: async (input) => {
    const body = await register(input);
    set({ user: body.user, ready: true });
  },

  applyUser: (user) => set({ user }),

  logout: async () => {
    try {
      await logoutRequest();
    } finally {
      set({ user: null, ready: true });
    }
  },

  clear: () => set({ user: null, ready: true }),
}));
