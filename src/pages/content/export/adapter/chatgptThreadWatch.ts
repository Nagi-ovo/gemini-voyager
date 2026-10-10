import {
  type ChatGptThreadMessage,
  TURN_ITEM_SELECTOR,
  TURN_VERSION_ATTRIBUTES,
  mountedTurnItems,
  readTurnFingerprint,
  readTurnKey,
  resolveVisibleConversationRoot,
} from './chatgptThread';

/**
 * Whether an item differs from `reference` (turn key to fingerprint): it shows
 * another version of a turn in it, or a turn missing from it. An edited
 * prompt's branch gives the prompt and every later turn new keys, so a missing
 * key is a change too. With `learn`, a missing key is added instead.
 */
function turnChanged(
  items: Iterable<Element>,
  reference: Map<string, string>,
  learn: boolean,
): boolean {
  for (const item of items) {
    const key = readTurnKey(item);
    if (!key || item.parentElement?.closest(TURN_ITEM_SELECTOR)) continue;
    const fingerprint = readTurnFingerprint(item);
    const known = reference.get(key);
    if (known === undefined) {
      if (!learn) return true;
      reference.set(key, fingerprint);
    } else if (known !== fingerprint) {
      return true;
    }
  }
  return false;
}

/**
 * The items the records touched, read from the nodes themselves: an item that
 * changed and unmounted in the same task is detached by now, yet still carries
 * the ids it showed. Removed nodes add nothing: what they show was seen when
 * they were added or changed.
 */
function recordedTurnItems(records: readonly MutationRecord[]): Set<Element> {
  const items = new Set<Element>();
  const addAround = (node: Node | null): void => {
    const element = node instanceof Element ? node : (node?.parentElement ?? null);
    const item = element?.closest(TURN_ITEM_SELECTOR);
    if (item) items.add(item);
  };
  for (const record of records) {
    addAround(record.target);
    for (const node of record.addedNodes) {
      addAround(node);
      if (node instanceof Element) {
        node.querySelectorAll(TURN_ITEM_SELECTOR).forEach((item) => items.add(item));
      }
    }
  }
  return items;
}

function fingerprints(messages: readonly ChatGptThreadMessage[]): Map<string, string> {
  return new Map(messages.map((message) => [message.turnKey, message.fingerprint]));
}

export interface ThreadVersionWatch {
  /**
   * Compare against what the crawl read from now on. A mounted turn it did not
   * read then counts as a change as well.
   */
  adopt(messages: readonly ChatGptThreadMessage[]): void;
  /** Whether a turn changed since the watch started; takes pending mutations into account. */
  changed(): boolean;
  stop(): void;
}

/**
 * Watch the thread for a turn that changes version. A branch switch is a
 * click on a mounted item; each mutation record is read from its own nodes,
 * so the switch is seen even when the item unmounts in the same task, or long
 * before the export reads its snapshot.
 *
 * Until {@link ThreadVersionWatch.adopt}, each turn is compared with the first
 * version the watch saw of it, from the first change in the thread on. The
 * watch disconnects once it sees a change, which includes another
 * conversation's turns on screen once the reader leaves; otherwise its owner
 * stops it when the export session ends.
 */
export function watchThreadVersions(): ThreadVersionWatch {
  const reference = new Map<string, string>();
  let learning = true;
  let changed = false;
  const observer = new MutationObserver((records) => check(recordedTurnItems(records)));

  function stop(): void {
    observer.disconnect();
  }

  function check(items: Iterable<Element>): void {
    if (changed) return;
    if (turnChanged(items, reference, learning)) {
      changed = true;
      stop();
    }
  }

  function drain(): void {
    check(recordedTurnItems(observer.takeRecords()));
  }

  observer.observe(resolveVisibleConversationRoot(document), {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [...TURN_VERSION_ATTRIBUTES],
  });

  return {
    adopt(messages) {
      // Records still pending are judged against what the crawl read.
      reference.clear();
      fingerprints(messages).forEach((fingerprint, key) => reference.set(key, fingerprint));
      learning = false;
      check(mountedTurnItems(resolveVisibleConversationRoot(document)));
    },
    changed() {
      drain();
      return changed;
    },
    stop,
  };
}
