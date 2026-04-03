export type CartLine = {
  internal_id: string;
  name: string;
  qty: number;
  unit_cost: number;
  // 参照専用の発注情報（任意・文字列）
  order_pack?: string;
  order_unit?: string;
  order_amount?: string;
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
let cachedCart: Cart | null = null;

function nowMs() {
  return Date.now();
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
    const qty0 = typeof r.qty === 'number' ? r.qty : 0;
    const qty = Math.max(0, qty0);
    const added_at = typeof r.added_at === 'number' ? r.added_at : 0;
    const order_pack =
      typeof r.order_pack === 'string'
        ? r.order_pack
        : typeof r.lot_size === 'number'
          ? String(Math.max(1, Math.floor(r.lot_size)))
          : undefined;
    const order_unit = typeof r.order_unit === 'string' ? r.order_unit : undefined;
    const order_amount = typeof r.order_amount === 'string' ? r.order_amount : undefined;
    const basis_need_qty = typeof r.basis_need_qty === 'number' ? r.basis_need_qty : undefined;
    const basis_days_of_cover = typeof r.basis_days_of_cover === 'number' ? r.basis_days_of_cover : undefined;
    lines.push({
      internal_id,
      name,
      qty,
      unit_cost,
      order_pack,
      order_unit,
      order_amount,
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
    // 他タブ更新を反映（snapshot参照を更新してからnotify）
    try {
      if (typeof e.newValue === 'string' && e.newValue) {
        cachedCart = normalizeCart(JSON.parse(e.newValue) as unknown);
      } else {
        cachedCart = defaultCart();
      }
    } catch {
      cachedCart = defaultCart();
    }
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
  // useSyncExternalStoreの要件: store変更がない限り同一参照を返す（無限ループ防止）
  if (cachedCart) return cachedCart;
  cachedCart = readLocalStorageCart();
  return cachedCart;
}

export function getServerSnapshot(): Cart {
  return defaultCart();
}

function commit(mutator: (prev: Cart) => Cart): Cart {
  const prev = getSnapshot();
  const next0 = mutator(prev);
  const next: Cart = { ...next0, updated_at: nowMs() };
  writeLocalStorageCart(next);
  cachedCart = next;
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
  order_pack?: string;
  order_unit?: string;
  order_amount?: string;
  basis_need_qty?: number;
  basis_days_of_cover?: number;
}): Cart {
  // 方針: 既に同一internal_idがある場合は数量加算。数量は手動入力を尊重し、丸めない。
  return commit((prev) => {
    const internal_id = String(params.internal_id || '').trim();
    if (!internal_id) return prev;
    const name = String(params.name || '').trim() || internal_id;
    const unit_cost = Math.max(0, Number(params.unit_cost || 0));
    const incomingQty = Math.max(0, Number(params.qty || 0));

    const idx = prev.lines.findIndex((l) => l.internal_id === internal_id);
    if (idx < 0) {
      const nextLine: CartLine = {
        internal_id,
        name,
        qty: incomingQty,
        unit_cost,
        order_pack: params.order_pack,
        order_unit: params.order_unit,
        order_amount: params.order_amount,
        basis_need_qty: params.basis_need_qty,
        basis_days_of_cover: params.basis_days_of_cover,
        added_at: nowMs(),
      };
      return { ...prev, lines: [...prev.lines, nextLine] };
    }

    const existing = prev.lines[idx];
    const qty = Math.max(0, Number(existing.qty || 0) + incomingQty);
    const merged: CartLine = {
      ...existing,
      name: existing.name || name,
      qty,
      // 参照専用情報も、既存に無ければ補完（カートに入れ直し/追加時に埋められる）
      order_pack: existing.order_pack ?? params.order_pack,
      order_unit: existing.order_unit ?? params.order_unit,
      order_amount: existing.order_amount ?? params.order_amount,
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
  patch: Partial<
    Pick<
      CartLine,
      'name' | 'qty' | 'unit_cost' | 'order_pack' | 'order_unit' | 'order_amount' | 'basis_need_qty' | 'basis_days_of_cover'
    >
  >
) {
  return commit((prev) => {
    const idx = prev.lines.findIndex((l) => l.internal_id === internal_id);
    if (idx < 0) return prev;
    const cur = prev.lines[idx];

    const next: CartLine = {
      ...cur,
      name: patch.name !== undefined ? String(patch.name) : cur.name,
      unit_cost: patch.unit_cost !== undefined ? Math.max(0, Number(patch.unit_cost)) : cur.unit_cost,
      qty: patch.qty !== undefined ? Math.max(0, Number(patch.qty)) : cur.qty,
      order_pack: patch.order_pack !== undefined ? String(patch.order_pack) : cur.order_pack,
      order_unit: patch.order_unit !== undefined ? String(patch.order_unit) : cur.order_unit,
      order_amount: patch.order_amount !== undefined ? String(patch.order_amount) : cur.order_amount,
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

