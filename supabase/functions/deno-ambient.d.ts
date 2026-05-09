/** Minimal Deno globals for IDE typechecking only (runtime is Deno on Supabase). */
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};
