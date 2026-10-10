import type { ModelProvider } from '@tributary/domain';

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  avatar: string | null;
}

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

export interface ModelConfig {
  id: string;
  provider: ModelProvider;
  model: string;
  baseUrl: string | null;
  isDefault: boolean;
  apiKeyMask: string;
}

export interface SearchHit {
  nodeId: string;
  conversationId: string;
  question: string;
  reply: string | null;
}

export interface UsageCall {
  id: string;
  nodeId: string;
  providerName: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  createdAt: string;
}

export interface UsageGroup {
  providerName: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
}

export interface UsageView {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  byModel: UsageGroup[];
  calls: UsageCall[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let onUnauthorized: () => void = () => {};

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

async function read<T>(response: Response, anonymous = false): Promise<T> {
  if (response.status === 401 && !anonymous) onUnauthorized();
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
    const error = body?.error;
    const detail =
      typeof error === 'string'
        ? error
        : typeof (error as { message?: unknown } | null)?.message === 'string'
          ? (error as { message: string }).message
          : null;
    throw new ApiError(detail ?? `请求失败 ${String(response.status)}`, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, { ...init, credentials: 'include' });
}

export function register(input: { email: string; password: string; displayName?: string }): Promise<{ user: PublicUser }> {
  return request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }).then((response) => read(response, true));
}

export function login(input: { email: string; password: string }): Promise<{ user: PublicUser }> {
  return request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }).then((response) => read(response, true));
}

export function logout(): Promise<void> {
  return request('/api/auth/logout', { method: 'POST' }).then((response) => read(response, true));
}

export function me(): Promise<{ user: PublicUser }> {
  return request('/api/auth/me').then((response) => read(response, true));
}

export function updateProfile(input: { displayName?: string }): Promise<{ user: PublicUser }> {
  return request('/api/auth/profile', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }).then((response) => read(response));
}

/** 上传头像：客户端压缩后的 data URL，服务端写对象存储 */
export function uploadAvatar(data: string): Promise<{ user: PublicUser }> {
  return request('/api/auth/avatar', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data }),
  }).then((response) => read(response));
}

export function removeAvatar(): Promise<void> {
  return request('/api/auth/avatar', { method: 'DELETE' }).then((response) => read(response));
}

export function changePassword(input: { currentPassword: string; newPassword: string }): Promise<void> {
  return request('/api/auth/password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }).then((response) => read(response));
}

export function listConversations(): Promise<{ conversations: Conversation[] }> {
  return request('/api/conversations').then((response) => read(response));
}

export function createConversation(title?: string): Promise<Conversation> {
  return request('/api/conversations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  }).then((response) => read(response));
}

export function loadConversation(id: string): Promise<{ conversation: Conversation; nodes: ConversationNode[] }> {
  return request(`/api/conversations/${id}`).then((response) => read(response));
}

export function createNode(input: {
  conversationId: string;
  question: string;
  relation: 'root' | 'child' | 'sibling';
  selectedNodeId?: string | null;
  providerId?: string | null;
  model?: string | null;
}): Promise<ConversationNode> {
  return request(`/api/conversations/${input.conversationId}/nodes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }).then((response) => read(response));
}

export function setCollapsed(id: string, collapsed: boolean): Promise<ConversationNode> {
  return request(`/api/nodes/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ collapsed }),
  }).then((response) => read(response));
}

export function regenerateNode(id: string): Promise<ConversationNode> {
  return request(`/api/nodes/${id}/regenerate`, { method: 'POST' }).then((response) => read(response));
}

export function deleteNode(id: string): Promise<void> {
  return request(`/api/nodes/${id}`, { method: 'DELETE' }).then((response) => read(response));
}

export function listModelConfigs(): Promise<{ configs: ModelConfig[] }> {
  return request('/api/model-configs').then((response) => read(response));
}

export function saveModelConfig(input: {
  provider: ModelProvider;
  apiKey: string;
  model: string;
  isDefault?: boolean;
  baseUrl?: string;
}): Promise<ModelConfig> {
  return request('/api/model-configs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }).then((response) => read(response));
}

export function setDefaultModelConfig(id: string): Promise<ModelConfig> {
  return request(`/api/model-configs/${id}/default`, { method: 'POST' }).then((response) => read(response));
}

export function deleteModelConfig(id: string): Promise<void> {
  return request(`/api/model-configs/${id}`, { method: 'DELETE' }).then((response) => read(response));
}

export function search(q: string): Promise<{ hits: SearchHit[] }> {
  return request(`/api/search?q=${encodeURIComponent(q)}`).then((response) => read(response));
}

export function usage(): Promise<UsageView> {
  return request('/api/usage').then((response) => read(response));
}

export function deleteConversation(id: string): Promise<void> {
  return request(`/api/conversations/${id}`, { method: 'DELETE' }).then((response) => read(response));
}

export interface AgentSettings {
  systemPrompt: string | null;
  defaultSystemPrompt: string;
}

export function getAgentSettings(): Promise<AgentSettings> {
  return request('/api/agent-settings').then((response) => read(response));
}

export function saveAgentSettings(systemPrompt: string | null): Promise<AgentSettings> {
  return request('/api/agent-settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ systemPrompt }),
  }).then((response) => read(response));
}
