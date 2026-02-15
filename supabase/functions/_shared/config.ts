// Shared configuration constants
export const FORM_BASE_URL = Deno.env.get("FORM_BASE_URL") || "https://jackdau.github.io/yourgp-care-plan-tool";
export const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL") || "noreply@ygp.au";
export const CLAUDE_MODEL = "claude-sonnet-4-20250514";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// UUID v4 format validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

// Standard JSON error response
export function errorResponse(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// Standard JSON success response
export function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(
    JSON.stringify(data),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
