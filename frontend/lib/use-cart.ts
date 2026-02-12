import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { Cart, CartLine } from './cart-store';
import {
  addToCart,
  clearCart,
  getServerSnapshot,
  getSnapshot,
  removeLine,
  setCartMeta,
  subscribe,
  updateLine,
} from './cart-store';

export function useCart(): {
  cart: Cart;
  lines: CartLine[];
  lineCount: number;
  totalQty: number;
  totalAmount: number;
  actions: {
    addToCart: typeof addToCart;
    updateLine: typeof updateLine;
    removeLine: typeof removeLine;
    clearCart: typeof clearCart;
    setCartMeta: typeof setCartMeta;
  };
} {
  const cart = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const lines = cart.lines || [];
  const lineCount = lines.length;

  const totals = useMemo(() => {
    let totalQty = 0;
    let totalAmount = 0;
    for (const l of lines) {
      totalQty += Number(l.qty || 0);
      totalAmount += Number(l.qty || 0) * Number(l.unit_cost || 0);
    }
    return { totalQty, totalAmount };
  }, [lines]);

  // actionsは参照安定性を保つ（UI側の不要再レンダを抑える）
  const actions = useMemo(() => {
    return { addToCart, updateLine, removeLine, clearCart, setCartMeta };
  }, []);

  // 互換: 呼び出し側が必要ならここでhook化
  const noop = useCallback(() => {}, []);
  void noop;

  return {
    cart,
    lines,
    lineCount,
    totalQty: totals.totalQty,
    totalAmount: totals.totalAmount,
    actions,
  };
}

