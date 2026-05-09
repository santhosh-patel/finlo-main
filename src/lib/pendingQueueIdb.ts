/**
 * Persist offline mutation queue in IndexedDB (larger, more reliable than localStorage).
 */

const DB_NAME = "finlo-pending-v1";
const STORE = "meta";
const KEY = "pending_ops";
const LEGACY_LS = "finlo.pending.v1";

export type PendingOp =
  | { kind: "insert"; row: import("@/lib/expenses").Expense }
  | { kind: "update"; id: string; patch: Partial<import("@/lib/expenses").Expense> }
  | { kind: "delete"; id: string };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export async function idbGetPending(): Promise<PendingOp[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const getReq = tx.objectStore(STORE).get(KEY);
      getReq.onerror = () => reject(getReq.error);
      getReq.onsuccess = () => {
        const v = getReq.result;
        resolve(Array.isArray(v) ? v : []);
      };
    });
  } catch {
    return [];
  }
}

export async function idbSetPending(ops: PendingOp[]): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve();
      tx.objectStore(STORE).put(ops, KEY);
    });
  } catch (e) {
    console.warn("idbSetPending failed", e);
  }
}

/** One-time migration from localStorage key used by older builds */
export function migrateLegacyPendingFromLocalStorage(): PendingOp[] {
  try {
    const raw = localStorage.getItem(LEGACY_LS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingOp[];
    if (!Array.isArray(parsed)) return [];
    localStorage.removeItem(LEGACY_LS);
    return parsed;
  } catch {
    return [];
  }
}
