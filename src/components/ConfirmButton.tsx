"use client";

import type { ComponentProps } from "react";

/** A submit button that asks before going ahead, for actions that notify the guest. */
export function ConfirmButton({ question, ...props }: ComponentProps<"button"> & { question: string }) {
  return (
    <button
      {...props}
      type="submit"
      onClick={(e) => {
        if (!window.confirm(question)) e.preventDefault();
      }}
    />
  );
}
