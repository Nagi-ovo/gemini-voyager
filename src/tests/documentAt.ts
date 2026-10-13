/** The jsdom document as if loaded at `url`: only `location` differs, methods stay bound. */
export function documentAt(url: string): Document {
  return new Proxy(document, {
    get(target, key) {
      if (key === 'location') return new URL(url);
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
