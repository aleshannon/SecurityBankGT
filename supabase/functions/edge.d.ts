declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Response | Promise<Response>): void
}

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  interface SupabaseClient {
    from(table: string): any
    auth: any
    rpc(fn: string, args?: Record<string, unknown>): Promise<{ data: any; error: { message: string } | null }>
  }
  export function createClient(url: string, key: string, options?: unknown): SupabaseClient
}
