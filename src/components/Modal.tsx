import { useEffect, useRef, type ReactNode } from "react";

export function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog id="dlg" ref={ref} onClose={onClose} onClick={e => { if (e.target === ref.current) onClose(); }}>
      {open ? children : null}
    </dialog>
  );
}
