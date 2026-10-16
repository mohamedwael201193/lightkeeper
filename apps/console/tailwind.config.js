/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        abyss: {
          DEFAULT: "#1414c8",
          deep: "#0d0d8f",
          darker: "#080864",
          ink: "#b9c2f5",
        },
        gold: {
          DEFAULT: "#d9a821",
          soft: "#e8c766",
          deep: "#a37c14",
        },
        porcelain: {
          DEFAULT: "#f4f6ff",
          blue: "#dfe6ff",
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', "Didot", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      letterSpacing: {
        mega: "0.35em",
      },
      keyframes: {
        floaty: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-14px)" },
        },
        sheen: {
          "0%": { transform: "translateX(-150%) skewX(-20deg)" },
          "100%": { transform: "translateX(250%) skewX(-20deg)" },
        },
        glowpulse: {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "0.9" },
        },
      },
      animation: {
        floaty: "floaty 7s ease-in-out infinite",
        sheen: "sheen 1.1s ease",
        glowpulse: "glowpulse 5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
