export type CartLine = {
  internal_id: string;
  name: string;
  qty: number;
  unit_cost: number;
  lot_size: number;
  basis_need_qty?: number;
  basis_days_of_cover?: number;
  added_at: number; // epoch ms
};

export type Cart = {
  version: 1;
  supplier: string;
  note: string;
  lines: CartLine[];
  updated_at: number; // epoch ms
};

const CART_STORAGE_KEY = 'po_cart_v1';

type Listener = () => void;
const listeners = new Set<Listener>();
let storageListenerReady = false;

function nowMs() {
  return Date.now();
}

function ceilToLot(qty: number, lot: number) {
  const l = Math.max(1, Number.isFinite(lot) ? lot : 1);
  const q = Math.max(0, Number.isFinite(qty) ? qty : 0);
  return Math.ceil(q / l) * l;
}

function defaultCart(): Cart {
  return { version: 1, supplier: '', note: '', lines: [], updated_at: 0 };
}

function normalizeCart(raw: unknown): Cart {
  if (!raw || typeof raw !== 'object') return defaultCart();
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1) return defaultCart();

  const supplier = typeof obj.supplier === 'string' ? obj.supplier : '';
  const note = typeof obj.note === 'string' ? obj.note : '';
  const updated_at = typeof obj.updated_at === 'number' ? obj.updated_at : 0;
  const linesRaw = Array.isArray(obj.lines) ? obj.lines : [];
  const lines: CartLine[] = [];

  for (const it of linesRaw) {
    if (!it || typeof it !== 'object') continue;
    const r = it as Record<string, unknown>;
    const internal_id = typeof r.internal_id === 'string' ? r.internal_id : '';
    if (!internal_id) continue;
    const name = typeof r.name === 'string' ? r.name : internal_id;
    const unit_cost = typeof r.unit_cost === 'number' ? Math.max(0, r.unit_cost) : 0;
    const lot_size = typeof r.lot_size === 'number' ? Math.max(1, Math.floor(r.lot_size)) : 1;
    const qty0 = typeof r.qty === 'number' ? r.qty : 0;
    const qty = ceilToLot(qty0, lot_size);
    const added_at = typeof r.added_at === 'number' ? r.added_at : 0;
    const basis_need_qty = typeof r.basis_need_qty === 'number' ? r.basis_need_qty : undefined;
    const basis_days_of_cover = typeof r.basis_days_of_cover === 'number' ? r.basis_days_of_cover : undefined;
    lines.push({
      internal_id,
      name,
      qty,
      unit_cost,
      lot_size,
      basis_need_qty,
      basis_days_of_cover,
      added_at,
    });
  }

  return {
    version: 1,
    supplier,
    note,
    lines,
    updated_at,
  };
}

function readLocalStorageCart(): Cart {
  if (typeof window === 'undefined') return defaultCart();
  try {
    const text = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!text) return defaultCart();
    return normalizeCart(JSON.parse(text) as unknown);
  } catch {
    return defaultCart();
  }
}

function writeLocalStorageCart(cart: Cart) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
}

function notify() {
  for (const l of listeners) l();
}

function ensureStorageListener() {
  if (storageListenerReady) return;
  storageListenerReady = true;
  if (typeof window === 'undefined') return;
  window.addEventListener('storage', (e) => {
    if (e.key !== CART_STORAGE_KEY) return;
    notify();
  });
}

export function subscribe(listener: Listener) {
  ensureStorageListener();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): Cart {
  return readLocalStorageCart();
}

export function getServerSnapshot(): Cart {
  return defaultCart();
}

function commit(mutator: (prev: Cart) => Cart): Cart {
  const prev = readLocalStorageCart();
  const next0 = mutator(prev);
  const next: Cart = { ...next0, updated_at: nowMs() };
  writeLocalStorageCart(next);
  notify();
  return next;
}

export function clearCart() {
  return commit(() => defaultCart());
}

export function setCartMeta(params: { supplier?: string; note?: string }) {
  return commit((prev) => ({
    ...prev,
    supplier: typeof params.supplier === 'string' ? params.supplier : prev.supplier,
    note: typeof params.note === 'string' ? params.note : prev.note,
  }));
}

export function addToCart(params: {
  internal_id: string;
  name: string;
  qty: number;
  unit_cost: number;
  lot_size: number;
  basis_need_qty?: number;
  basis_days_of_cover?: number;
}): Cart {
  // 方針: 既に同一internal_idがある場合は「数量加算」して丸め直す（カートらしい動作）。
  return commit((prev) => {
    const internal_id = String(params.internal_id || '').trim();
    if (!internal_id) return prev;
    const name = String(params.name || '').trim() || internal_id;
    const unit_cost = Math.max(0, Number(params.unit_cost || 0));
    const incomingLot = Math.max(1, Math.floor(Number(params.lot_size || 1)));
    const incomingQty = Math.max(0, Number(params.qty || 0));

    const idx = prev.lines.findIndex((l) => l.internal_id === internal_id);
    if (idx < 0) {
      const qty = ceilToLot(incomingQty, incomingLot);
      const nextLine: CartLine = {
        internal_id,
        name,
        qty,
        unit_cost,
        lot_size: incomingLot,
        basis_need_qty: params.basis_need_qty,
        basis_days_of_cover: params.basis_days_of_cover,
        added_at: nowMs(),
      };
      return { ...prev, lines: [...prev.lines, nextLine] };
    }

    const existing = prev.lines[idx];
    const lot = existing.lot_size || incomingLot || 1;
    const qty = ceilToLot((existing.qty || 0) + incomingQty, lot);
    const merged: CartLine = {
      ...existing,
      name: existing.name || name,
      // 既存の編集値を優先（unit_cost, lot_size）。basisは無ければ補完。
      qty,
      basis_need_qty: existing.basis_need_qty ?? params.basis_need_qty,
      basis_days_of_cover: existing.basis_days_of_cover ?? params.basis_days_of_cover,
    };

    const nextLines = prev.lines.slice();
    nextLines[idx] = merged;
    return { ...prev, lines: nextLines };
  });
}

export function updateLine(
  internal_id: string,
  patch: Partial<Pick<CartLine, 'name' | 'qty' | 'unit_cost' | 'lot_size' | 'basis_need_qty' | 'basis_days_of_cover'>>
) {
  return commit((prev) => {
    const idx = prev.lines.findIndex((l) => l.internal_id === internal_id);
    if (idx < 0) return prev;
    const cur = prev.lines[idx];

    const nextLot =
      patch.lot_size !== undefined
        ? Math.max(1, Math.floor(Number(patch.lot_size)))
        : cur.lot_size;
    const nextQty0 = patch.qty !== undefined ? Number(patch.qty) : cur.qty;
    const nextQty = ceilToLot(Math.max(0, nextQty0), nextLot);

    const next: CartLine = {
      ...cur,
      name: patch.name !== undefined ? String(patch.name) : cur.name,
      unit_cost: patch.unit_cost !== undefined ? Math.max(0, Number(patch.unit_cost)) : cur.unit_cost,
      lot_size: nextLot,
      qty: nextQty,
      basis_need_qty: patch.basis_need_qty !== undefined ? patch.basis_need_qty : cur.basis_need_qty,
      basis_days_of_cover: patch.basis_days_of_cover !== undefined ? patch.basis_days_of_cover : cur.basis_days_of_cover,
    };

    const nextLines = prev.lines.slice();
    nextLines[idx] = next;
    return { ...prev, lines: nextLines };
  });
}

export function removeLine(internal_id: string) {
  return commit((prev) => ({ ...prev, lines: prev.lines.filter((l) => l.internal_id !== internal_id) }));
}

