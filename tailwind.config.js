/** Tailwind config for the compiled build (see scripts/build-css.sh).
 *  Mirrors the old inline Play-CDN config (Inter font + tracking-tightest). */
module.exports = {
  content: ["./index.html"],
  theme: { extend: {
    fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system"] },
    letterSpacing: { tightest: "-0.04em" }
  } }
};
