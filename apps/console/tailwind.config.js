/** Porcelain Console — light theme only. No blue-on-blue text anywhere. */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FFFFFF",
        porcelain: "#F8FAFF",
        tint: "#EAF1FF",
        tintdeep: "#D9E6FF",
        ink: "#0B1533",
        slate: "#5A6B8C",
        accent: "#2456E6",
        accentdeep: "#1A3FA8",
        gold: "#C9A227",
        golddeep: "#8A6F12",
        pass: "#16A34A",
        fail: "#DC2626",
        hairline: "#E3EAF9",
        royal: "#1414c8",
      },
      fontFamily: {
        display: ['"Playfair Display"', "Didot", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      keyframes: {
        floaty: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
      animation: {
        floaty: "floaty 7s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
