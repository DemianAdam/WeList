import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose?.();
      }}
      aria-label={title}
    >
      {onClose && (
        <button className="close" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
      )}
      {children}
    </dialog>
  );
}
