/**
 * Fixed atmosphere layers: aurora gradients, blueprint grid, film grain,
 * vignette. Pure CSS/SVG — zero runtime cost after paint.
 */
export function BackgroundFX() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* aurora */}
      <div className="absolute -top-[30%] left-1/2 h-[80vh] w-[120vw] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(closest-side,rgba(109,94,240,0.22),transparent)] blur-2xl" />
      <div className="absolute top-[35%] -left-[15%] h-[55vh] w-[45vw] rounded-[100%] bg-[radial-gradient(closest-side,rgba(46,230,168,0.07),transparent)] blur-2xl" />
      <div className="absolute top-[55%] -right-[18%] h-[60vh] w-[50vw] rounded-[100%] bg-[radial-gradient(closest-side,rgba(255,95,143,0.06),transparent)] blur-2xl" />

      {/* blueprint grid */}
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(139,124,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(139,124,255,0.05) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(ellipse 90% 60% at 50% 0%, black 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 60% at 50% 0%, black 30%, transparent 75%)",
        }}
      />

      {/* film grain */}
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_90%_at_50%_0%,transparent_55%,rgba(4,1,16,0.9))]" />
    </div>
  );
}
