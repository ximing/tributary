import { describe, expect, it, vi } from 'vitest';
import { createStreamHub } from './stream-bus.js';

describe('createStreamHub', () => {
  it('delivers a node id to current subscribers only', () => {
    const hub = createStreamHub();
    const heard = vi.fn();
    const stop = hub.subscribe(heard);
    hub.publish('node-1');
    stop();
    hub.publish('node-2');
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard).toHaveBeenCalledWith('node-1');
  });
});
