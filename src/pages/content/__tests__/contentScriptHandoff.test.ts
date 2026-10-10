import { describe, expect, it, vi } from 'vitest';

import { CONTENT_SCRIPT_HANDOFF_EVENT, claimContentScript } from '../contentScriptHandoff';

describe('content script handoff', () => {
  it('re-injecting Voyager into an open tab retires the earlier copy once', () => {
    const orphaned = () => true;
    const retireOld = vi.fn();
    const retireNew = vi.fn();
    claimContentScript(retireOld, orphaned);
    expect(retireOld).not.toHaveBeenCalled();

    claimContentScript(retireNew, orphaned);
    expect(retireOld).toHaveBeenCalledTimes(1);
    expect(retireNew).not.toHaveBeenCalled();

    const retireNewest = vi.fn();
    claimContentScript(retireNewest, orphaned);
    expect(retireOld).toHaveBeenCalledTimes(1);
    expect(retireNew).toHaveBeenCalledTimes(1);
    expect(retireNewest).not.toHaveBeenCalled();
  });

  it('a page firing the handoff event cannot shut down a live Voyager', () => {
    const retire = vi.fn();
    const stop = claimContentScript(retire, () => false);

    document.dispatchEvent(new Event(CONTENT_SCRIPT_HANDOFF_EVENT));

    expect(retire).not.toHaveBeenCalled();
    stop();
  });
});
