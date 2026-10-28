"use client";

import { useCallback, useRef, useState, type ComponentProps, type ReactNode } from "react";

type Ask = { question: ReactNode; confirmLabel: string; resolve: (ok: boolean) => void };

/**
 * An in-page confirmation dialog, in the app's style, instead of the browser's grey confirm(). `confirm()`
 * opens it and resolves to true if the person confirms; render `dialog` once in the component.
 */
export function useConfirm() {
  const ref = useRef<HTMLDialogElement>(null);
  const [ask, setAsk] = useState<Ask | null>(null);

  const confirm = useCallback(
    (question: ReactNode, confirmLabel = "Conferma") =>
      new Promise<boolean>((resolve) => {
        setAsk({ question, confirmLabel, resolve });
        // Open after React has rendered the question into the dialog.
        requestAnimationFrame(() => ref.current?.showModal());
      }),
    [],
  );

  const answer = (ok: boolean) => {
    ref.current?.close();
    ask?.resolve(ok);
    setAsk(null);
  };

  const dialog = (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-question"
      onCancel={(e) => {
        e.preventDefault();
        answer(false);
      }}
      onClick={(e) => {
        // A click on the backdrop (the dialog itself, outside its content) means no.
        if (e.target === ref.current) answer(false);
      }}
    >
      <div className="modal-body">
        <p id="modal-question" className="modal-question">{ask?.question}</p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => answer(false)}>
            Annulla
          </button>
          <button type="button" className="btn btn-danger-fill" autoFocus onClick={() => answer(true)}>
            {ask?.confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );

  return { confirm, dialog };
}

/** A submit button that asks first, in a proper dialog, for actions that delete or notify the guest. */
export function ConfirmButton({
  question,
  confirmLabel,
  ...props
}: Omit<ComponentProps<"button">, "type" | "onClick"> & { question: ReactNode; confirmLabel?: string }) {
  const button = useRef<HTMLButtonElement>(null);
  const { confirm, dialog } = useConfirm();
  return (
    <>
      <button
        {...props}
        ref={button}
        type="button"
        onClick={async () => {
          if (await confirm(question, confirmLabel)) button.current?.form?.requestSubmit();
        }}
      />
      {dialog}
    </>
  );
}
