/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./reminder.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        mint: { 500: "#4CAF8F" },
        warm: "#FAFAF8",
        ink: "#252525",
        mute: "#888888",
        sun: "#FFB86B",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px) scale(0.985)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "fade-in": { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        breathe: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.55" },
          "50%": { transform: "scale(1.06)", opacity: "0.9" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.8)" },
          "60%": { opacity: "1", transform: "scale(1.04)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "slide-down": {
          "0%": { opacity: "0", transform: "translateY(-6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.36s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fade-in 0.24s ease-out both",
        breathe: "breathe 4.5s ease-in-out infinite",
        "pop-in": "pop-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) both",
        "slide-down": "slide-down 0.2s ease-out both",
      },
    },
  },
  plugins: [],
};
