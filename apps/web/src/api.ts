export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationNode {
  id: string;
  parentId: string | null;
  question: string;
  reply: string | null;
  status: string;
  providerId: string | null;
  model: string | null;
  collapsed: boolean;
  position: number;
}

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  models: string[];
  apiKeyMask: string;
}

export interface SearchHit {
  nodeId: string;
  conversationId: string;
  question: string;
  reply: string | null;
}

export interface UsageView {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: {
    id: string;
    nodeId: string;
    providerName: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }[];
}

async function read<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `请求失败 ${String(response.status)}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function listConversations(): Promise<{ conversations: Conversation[] }> {
  return fetch('/api/conversations').then((response) => read(response));
}

export function createConversation(title?: string): Promise<Conversation> {
  return fetch('/api/conversations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  }).then((response) => read(response));
}

export function loadConversation(id: string): Promise<{ conversation: Conversation; nodes: ConversationNode[] }> {
  return fetch(`/api/conversations/${id}`).then((response) => read(response));
}

export function createNode(input: {
  conversationId: string;
  question: string;
  relation: 'root' | 'child' | 'sibling';
  selectedNodeId?: string | null;
  providerId?: string | null;
  model?: string | null;
}): Promise<ConversationNode> {
  return fetch(`/api/conversations/${input.conversationId}/nodes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }).then((response) => read(response));
}

export function setCollapsed(id: string, collapsed: boolean): Promise<ConversationNode> {
  return fetch(`/api/nodes/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ collapsed }),
  }).then((response) => read(response));
}

export function listProviders(): Promise<{ providers: Provider[] }> {
  return fetch('/api/providers').then((response) => read(response));
}

export function saveProvider(input: {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
}): Promise<Provider> {
  return fetch('/api/providers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }).then((response) => read(response));
}

export function search(q: string): Promise<{ hits: SearchHit[] }> {
  return fetch(`/api/search?q=${encodeURIComponent(q)}`).then((response) => read(response));
}

export function usage(): Promise<UsageView> {
  return fetch('/api/usage').then((response) => read(response));
}
