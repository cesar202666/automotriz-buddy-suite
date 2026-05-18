import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  // Priorizar NEXT_PUBLIC_* (set por la integración Vercel↔Supabase nueva)
  // sobre cualquier var heredada como SUPABASE_URL/VITE_SUPABASE_URL que
  // pudiera estar apuntando al proyecto viejo.
  const supabaseUrl =
    env.NEXT_PUBLIC_SUPABASE_URL ||
    env.VITE_SUPABASE_URL ||
    env.SUPABASE_URL ||
    "";

  const supabaseKey =
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.VITE_SUPABASE_ANON_KEY ||
    env.SUPABASE_PUBLISHABLE_KEY ||
    env.SUPABASE_ANON_KEY ||
    "";

  const publicAppUrl =
    env.VITE_PUBLIC_APP_URL || env.NEXT_PUBLIC_APP_URL || "";

  // Logueo en build para verificar qué Supabase quedó hardcodeado en el bundle
  // eslint-disable-next-line no-console
  console.log(
    `[vite.config] Building with Supabase URL: ${
      supabaseUrl || "(none — app will fail to connect)"
    }`
  );

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabaseKey),
      "import.meta.env.VITE_PUBLIC_APP_URL": JSON.stringify(publicAppUrl),
    },
  };
});
