import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sessions, users } from '../db/schema.js';
import { deleteObject, isStorageConfigured, presignGet, putObject } from '../storage/client.js';
import { readSessionToken } from './cookies.js';
import { hashPassword, verifyPassword } from './password.js';

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  avatar: string | null;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * avatar 列存对象存储的 key；返回给客户端时换成预签名临时 URL。
 * 历史数据里的 data URL 原样返回，兼容未迁移的头像。
 */
async function toPublic(row: typeof users.$inferSelect): Promise<PublicUser> {
  let avatar: string | null = null;
  if (row.avatar) {
    if (row.avatar.startsWith('data:')) {
      avatar = row.avatar;
    } else if (isStorageConfigured()) {
      try {
        avatar = await presignGet(row.avatar);
      } catch (error) {
        console.error('avatar.presign_failed', error instanceof Error ? error.message : error);
      }
    }
  }
  return { id: row.id, email: row.email, displayName: row.displayName, avatar };
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && typeof current === 'object' && current !== null; depth += 1) {
    if ('code' in current && (current as { code?: unknown }).code === '23505') return true;
    current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}

async function openSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.insert(sessions).values({
    id: randomUUID(),
    userId,
    tokenHash: tokenHash(token),
    expiresAt: new Date(Date.now() + SESSION_MS),
  });
  return token;
}

export async function registerUser(input: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<{ user: PublicUser; token: string }> {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName?.trim() || null;
  try {
    const [row] = await db
      .insert(users)
      .values({
        id: randomUUID(),
        email,
        passwordHash: await hashPassword(input.password),
        displayName,
      })
      .returning();
    if (!row) throw new AuthError('注册失败', 500);
    const token = await openSession(row.id);
    return { user: await toPublic(row), token };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (isUniqueViolation(error)) throw new AuthError('这个邮箱已经注册过了', 409);
    throw error;
  }
}

export async function loginUser(input: { email: string; password: string }): Promise<{ user: PublicUser; token: string }> {
  const email = input.email.trim().toLowerCase();
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const matches = row ? await verifyPassword(input.password, row.passwordHash) : false;
  if (!row || !matches) throw new AuthError('邮箱或密码不正确', 401);
  const token = await openSession(row.id);
  return { user: await toPublic(row), token };
}

export async function logoutToken(token: string | null): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash(token)));
}

export async function userFromToken(token: string): Promise<PublicUser | null> {
  const now = new Date();
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, tokenHash(token)), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!session) return null;
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  return user ? await toPublic(user) : null;
}

export async function userFromCookie(cookieHeader: string | undefined): Promise<PublicUser | null> {
  const token = readSessionToken(cookieHeader);
  if (!token) return null;
  return userFromToken(token);
}

/** 更新昵称（头像走 uploadAvatar / removeAvatar 专用接口） */
export async function updateProfile(userId: string, input: { displayName?: string }): Promise<PublicUser> {
  const patch: Partial<typeof users.$inferInsert> = {};
  if (input.displayName !== undefined) patch.displayName = input.displayName.trim() || null;
  const [row] = await db.update(users).set(patch).where(eq(users.id, userId)).returning();
  if (!row) throw new AuthError('用户不存在', 404);
  return toPublic(row);
}

const AVATAR_DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/;

/** 上传头像：解码 data URL 写入对象存储，avatar 列只存 key */
export async function uploadAvatar(userId: string, dataUrl: string): Promise<PublicUser> {
  if (!isStorageConfigured()) throw new AuthError('对象存储未配置', 503);
  const match = AVATAR_DATA_URL.exec(dataUrl);
  if (!match) throw new AuthError('头像格式无效', 400);
  const bytes = Buffer.from(match[2]!, 'base64');
  if (bytes.length === 0 || bytes.length > 400_000) throw new AuthError('头像过大（请小于 300KB）', 400);
  const key = `avatars/${userId}.jpg`;
  await putObject(key, new Uint8Array(bytes), match[1]!);
  const [row] = await db.update(users).set({ avatar: key }).where(eq(users.id, userId)).returning();
  if (!row) throw new AuthError('用户不存在', 404);
  return toPublic(row);
}

/** 移除头像：清列，并尽力删除对象 */
export async function removeAvatar(userId: string): Promise<void> {
  const [row] = await db.update(users).set({ avatar: null }).where(eq(users.id, userId)).returning();
  if (!row) throw new AuthError('用户不存在', 404);
  if (row.avatar && !row.avatar.startsWith('data:') && isStorageConfigured()) {
    try {
      await deleteObject(row.avatar);
    } catch (error) {
      console.error('avatar.delete_failed', error instanceof Error ? error.message : error);
    }
  }
}

/** 修改密码：先校验旧密码 */
export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) throw new AuthError('用户不存在', 404);
  const matches = await verifyPassword(currentPassword, row.passwordHash);
  if (!matches) throw new AuthError('当前密码不正确', 400);
  await db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, userId));
}
