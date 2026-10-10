import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { DEFAULT_SYSTEM_PROMPT } from './prompt.js';

export const agentSettingsBody = z.object({
  systemPrompt: z.string().max(20_000).nullable(),
}).strict();

export async function readAgentSettings(userId: string) {
  const [row] = await db.select({ systemPrompt: users.systemPrompt }).from(users).where(eq(users.id, userId)).limit(1);
  return { systemPrompt: row?.systemPrompt?.trim() || null, defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT };
}

export async function saveAgentSettings(userId: string, systemPrompt: string | null) {
  await db.update(users).set({ systemPrompt: systemPrompt?.trim() || null }).where(eq(users.id, userId));
  return readAgentSettings(userId);
}
