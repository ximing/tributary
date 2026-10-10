/** 已经不值得重试的失败。队列记为 failed，不再退避。 */
export class AgentTerminalError extends Error {
  readonly terminal = true;

  constructor(message: string) {
    super(message);
    this.name = 'AgentTerminalError';
  }
}
