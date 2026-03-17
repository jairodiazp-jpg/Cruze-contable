// Minimal type declarations for Deno globals so VS Code's Node TS engine
// does not report "Cannot find name 'Deno'" on Edge Function files.
// These files run in the Deno runtime; the real Deno types come from the Deno
// executable and the Deno VS Code extension (denoland.vscode-deno).

declare namespace Deno {
  const env: {
    get(key: string): string | undefined;
  };
}

// Allow URL-style module specifiers (https://esm.sh/..., https://deno.land/...)
// Declaring them as ambient modules (any) silences VS Code's Node TS engine.
// Named and default imports from these URLs are valid in the Deno runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module "https://*";
