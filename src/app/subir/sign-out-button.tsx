"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await authClient.signOut();
        } finally {
          setPending(false);
          router.refresh();
        }
      }}
      className="rounded-full border border-line px-3 py-1.5 text-sm text-ink-muted hover:border-blue hover:text-ink"
    >
      {pending ? "Saliendo…" : "Cerrar sesión"}
    </button>
  );
}
