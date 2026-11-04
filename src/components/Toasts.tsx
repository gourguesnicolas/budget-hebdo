import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export interface ToastAction { label: string; fn: () => void }
interface Item { id: number; msg: string; action?: ToastAction }
type ToastFn = (msg: string, action?: ToastAction) => void;
const Ctx = createContext<ToastFn>(() => undefined);
export const useToast = (): ToastFn => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const seq = useRef(0);
  const remove = useCallback((id: number) => setItems(l => l.filter(i => i.id !== id)), []);
  const toast = useCallback<ToastFn>((msg, action) => {
    const id = ++seq.current;
    setItems(l => [...l, { id, msg, action }]);
    setTimeout(() => remove(id), action ? 7000 : 4000);
  }, [remove]);
  const value = useMemo(() => toast, [toast]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div id="toast" aria-live="polite">
        {items.map(i => (
          <div className="toast-item" key={i.id}>
            <span>{i.msg}</span>
            {i.action && <button onClick={() => { i.action!.fn(); remove(i.id); }}>{i.action.label}</button>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
