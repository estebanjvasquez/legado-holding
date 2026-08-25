/* =============================================================================
   Errores tipados. Sólo ValidationError por ahora — el handler raíz la
   distingue de Error genérico para devolver HTTP 400 en vez de 500.

   Cualquier validación de input del cliente (campos faltantes, formato malo,
   tamaño excedido, valores no permitidos) DEBE lanzar ValidationError. Los
   errores que sí son del servidor (Invoice Ninja caído, Supabase inválido,
   OpenAI error, etc.) se quedan como Error genérico → 500.
   ============================================================================= */

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.isValidationError = true;
  }
}

export function isValidationError(e) {
  return e && (e.isValidationError === true || e.name === "ValidationError");
}
