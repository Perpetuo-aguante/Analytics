import { getAuth } from "@/lib/auth/server";

// Proxy de Neon Auth: el cliente del navegador (lib/auth/client.ts) habla con
// esta ruta del mismo dominio, y esta reenvía a Neon Auth y fija las cookies
// de sesión.
type Handler = ReturnType<ReturnType<typeof getAuth>["handler"]>["GET"];

function forward(method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"): Handler {
  return (request, context) => getAuth().handler()[method](request, context);
}

export const GET = forward("GET");
export const POST = forward("POST");
export const PUT = forward("PUT");
export const DELETE = forward("DELETE");
export const PATCH = forward("PATCH");
