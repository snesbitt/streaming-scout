// Fake @netlify/blobs for offline verification.
//
// The point of this harness is the read lag. Netlify Blobs is eventually
// consistent: a write becomes visible to reads roughly 5 seconds later. That
// lag is the whole reason the old whole-list read-modify-write lost data, so
// a fake store with instant reads would prove nothing.
//
// Every write is recorded against a virtual clock. A read returns the newest
// version committed at or before (now - LAG_MS). Tests advance the clock
// explicitly, so there is no real waiting and no flakiness.

export const LAG_MS = 5000;

const DELETED = Symbol("deleted");

let now = 1000000;

export function advance(ms) {
  now += ms;
}
export function currentTime() {
  return now;
}

const stores = new Map();

class FakeStore {
  constructor(name) {
    this.name = name;
    this.versions = new Map(); // key -> [{ t, value }]
  }

  _visible(key) {
    const history = this.versions.get(key);
    if (!history) return undefined;
    const cutoff = now - LAG_MS;
    let seen;
    for (const v of history) {
      if (v.t <= cutoff) seen = v.value;
    }
    return seen;
  }

  _write(key, value) {
    if (!this.versions.has(key)) this.versions.set(key, []);
    this.versions.get(key).push({ t: now, value });
  }

  async get(key, opts) {
    const v = this._visible(key);
    if (v === undefined || v === DELETED) return null;
    if (opts && opts.type === "json") return JSON.parse(JSON.stringify(v));
    return JSON.stringify(v);
  }

  async setJSON(key, value) {
    this._write(key, JSON.parse(JSON.stringify(value)));
  }

  async set(key, value) {
    this._write(key, value);
  }

  async delete(key) {
    this._write(key, DELETED);
  }

  async list(opts) {
    const prefix = (opts && opts.prefix) || "";
    const blobs = [];
    for (const key of this.versions.keys()) {
      if (!key.startsWith(prefix)) continue;
      const v = this._visible(key);
      if (v === undefined || v === DELETED) continue;
      blobs.push({ key, etag: "fake" });
    }
    return { blobs, directories: [] };
  }

  // Test-only helper: seed data as if it had been written long ago, so it is
  // immediately visible without advancing the clock.
  _seed(key, value) {
    if (!this.versions.has(key)) this.versions.set(key, []);
    this.versions.get(key).push({ t: now - LAG_MS * 100, value });
  }
}

export function getStore(name) {
  if (!stores.has(name)) stores.set(name, new FakeStore(name));
  return stores.get(name);
}

export function resetStores() {
  stores.clear();
}
