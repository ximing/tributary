import { Service } from '@rabjs/react';
import { login, logout as logoutRequest, me, register as registerAccount, type PublicUser } from '../api/client.js';

/** 应用级会话。登录态在整次打开里保持，未授权时由入口清掉。 */
export class SessionService extends Service {
  ready = false;
  user: PublicUser | null = null;

  async load(): Promise<void> {
    try {
      const body = await me();
      this.user = body.user;
      this.ready = true;
    } catch {
      this.user = null;
      this.ready = true;
    }
  }

  async signIn(input: { email: string; password: string }): Promise<void> {
    const body = await login(input);
    this.user = body.user;
    this.ready = true;
  }

  async signUp(input: { email: string; password: string; displayName?: string }): Promise<void> {
    const body = await registerAccount(input);
    this.user = body.user;
    this.ready = true;
  }

  applyUser(user: PublicUser): void {
    this.user = user;
  }

  async logout(): Promise<void> {
    try {
      await logoutRequest();
    } finally {
      this.user = null;
      this.ready = true;
    }
  }

  clear(): void {
    this.user = null;
    this.ready = true;
  }
}
