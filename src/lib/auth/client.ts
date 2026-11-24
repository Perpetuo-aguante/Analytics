"use client";

import { createAuthClient } from "@neon/auth/next";

// Cliente de Neon Auth para el navegador. No lleva URL: habla con la ruta
// /api/auth de esta misma app (app/api/auth/[...path]/route.ts).
export const authClient = createAuthClient();
