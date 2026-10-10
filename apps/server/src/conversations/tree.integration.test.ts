import { afterAll, expect, it } from 'vitest';
import { closeDb, pool } from '../db/client.js';
import { ensureSchema } from '../db/ensure.js';
import { completeQuestionNode, createConversation, createQuestionNode, deleteConversation, loadConversation } from './service.js';

const created: string[] = [];

afterAll(async () => {
  for (const id of created) await deleteConversation(id);
  await closeDb();
});

it('reloads a question, its reply, a follow-up, and a sibling from the test database', async () => {
  await ensureSchema();
  const identity = await pool.query<{ current_user: string; rolsuper: boolean; current_database: string }>(
    'select current_user, rolsuper, current_database() from pg_roles where rolname = current_user',
  );
  const who = identity.rows[0];
  expect(who?.current_user).not.toBe('postgres');
  expect(who?.rolsuper).toBe(false);
  expect(who?.current_database).toBe('tributary_test');

  const conversation = await createConversation('test:tree');
  created.push(conversation.id);
  const root = await createQuestionNode({
    conversationId: conversation.id,
    question: '根问题',
    relation: 'root',
  });
  const rootDone = await completeQuestionNode(root.id, { reply: '根回复', status: 'done', model: 'stub', providerName: 'stub', promptTokens: 1, completionTokens: 1, totalTokens: 2 });
  const child = await createQuestionNode({
    conversationId: conversation.id,
    question: '追问',
    relation: 'child',
    selectedNodeId: root.id,
  });
  await completeQuestionNode(child.id, { reply: '追问回复', status: 'done' });
  const sibling = await createQuestionNode({
    conversationId: conversation.id,
    question: '同级',
    relation: 'sibling',
    selectedNodeId: child.id,
  });
  await completeQuestionNode(sibling.id, { reply: '同级回复', status: 'done' });

  const reloaded = await loadConversation(conversation.id);
  expect(reloaded?.nodes).toHaveLength(3);
  const byQuestion = new Map(reloaded?.nodes.map((node) => [node.question, node]));
  expect(byQuestion.get('根问题')).toMatchObject({ reply: '根回复', parentId: null, id: rootDone.id });
  expect(byQuestion.get('追问')?.parentId).toBe(root.id);
  expect(byQuestion.get('同级')?.parentId).toBe(root.id);
  expect(byQuestion.get('同级')?.parentId).not.toBe(child.id);
  expect(byQuestion.get('同级')?.reply).toBe('同级回复');
  expect(byQuestion.get('追问')?.reply).toBe('追问回复');
});
