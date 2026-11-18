import { FileText, KeyRound, PackageCheck } from "lucide-react";

/**
 * The front page's picture of what WinRelease does: the sample project, described on the left of the arrow, one MSI on the right. It is drawn from the sample
 * project's own content (sampleProject.ts), so keep the two in step. Decorative detail only: the heading and text beside it carry the meaning.
 */
const SOURCES = [
  {
    icon: FileText,
    name: "Welcome.txt",
    to: "Program Files\\GE App Solutions\\WinRelease Sample",
  },
  {
    icon: FileText,
    name: "Welcome32.txt",
    to: "Program Files (x86)\\GE App Solutions\\WinRelease Sample",
  },
  {
    icon: KeyRound,
    name: "HKLM\\SOFTWARE\\GE App Solutions\\WinRelease Sample",
    to: "3 values (64-bit) and 2 values (32-bit)",
  },
];

export function HeroFlow() {
  return (
    <figure
      role="img"
      aria-label="The sample project: two files and some registry values go in, and one Windows Installer package comes out."
      className="mx-auto w-full max-w-xl select-none"
    >
      <div className="overflow-hidden rounded-xl border border-subtle bg-panel shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between border-b border-subtle bg-panel-alt px-3 py-2 text-xs text-muted">
          <span className="flex items-center gap-2">
            <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-brand text-[9px] font-bold text-canvas">
              W
            </span>
            WinRelease Sample 1.0.0 Setup
          </span>
          <span aria-hidden="true" className="flex gap-3 font-mono">
            <span>&minus;</span>
            <span>&#9633;</span>
            <span>&times;</span>
          </span>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
              You describe
            </p>
            <ul className="mt-2 space-y-2">
              {SOURCES.map((source) => (
                <li
                  key={source.name}
                  className="flex items-start gap-2.5 rounded-md border border-subtle bg-canvas/60 px-3 py-2"
                >
                  <source.icon
                    size={15}
                    className="mt-0.5 shrink-0 text-brand"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 text-xs">
                    <span className="block break-words font-mono text-ink">
                      {source.name}
                    </span>
                    <span className="block break-words font-mono text-muted">
                      &rarr; {source.to}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div
            className="flex items-center gap-3 text-xs text-muted"
            aria-hidden="true"
          >
            <span className="h-px flex-1 bg-subtle" />
            <span className="font-mono">WiX builds it on your PC</span>
            <span className="h-px flex-1 bg-subtle" />
          </div>

          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
              You get
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-brand/60 bg-brand/10 px-3 py-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                <PackageCheck
                  size={18}
                  className="text-brand"
                  aria-hidden="true"
                />
                One .msi file
              </span>
              <span className="flex flex-wrap gap-1.5 text-[11px] text-muted">
                {["Install", "Repair", "Upgrade", "Remove"].map((verb) => (
                  <span
                    key={verb}
                    className="rounded-full border border-subtle px-2 py-0.5"
                  >
                    {verb}
                  </span>
                ))}
              </span>
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}
