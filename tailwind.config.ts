import type { Config } from "tailwindcss";
export default { darkMode: ["class"], content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"], theme: { extend: { borderRadius: { xl: "1rem", "2xl": "1.25rem" } } }, plugins: [] } satisfies Config;
