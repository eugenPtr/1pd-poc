type IntroModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function IntroModal({ isOpen, onClose }: IntroModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-base-300/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-base-300 bg-base-100 p-6 shadow-2xl">
        <header className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xl font-semibold uppercase tracking-wide text-primary">1pd Proof Of Concept</p>
            <h2 className="text-3xl font-bold tracking-tight">What am I looking at?</h2>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Close intro modal">
            ✕
          </button>
        </header>

        <div className="mt-5 space-y-4 text-sm leading-relaxed text-base-content/90">
          <p>
            This is a lightweight implementation of 1pd, combining primitives we plan to use for the MVP — liquidity
            bootstrapping pools and bonding curves.
          </p>
          <p className="font-semibold">
            🎯 It&apos;s purpose is to help us experiment with different configs/params and gather insights so we can
            design an awesome MVP
          </p>
          <p>
            It&apos;s a POC, so weirdness is expected. For example, SELL transactions can fail when an LBP doesn&apos;t
            have enough ETH to cover the bag being offloaded. If that happens, just retry with a smaller amount.
          </p>

          <section className="space-y-2">
            <h3 className="text-base font-semibold text-base-content">What can you do here?</h3>
            <ul className="list-disc space-y-2 pl-5">
              <li>First, scroll down and find the button to start a new round</li>
              <li>During a round, create an option (position) - this is a token proposal</li>
              <li>Position creators keep 10% of the supply.</li>
              <li>
                Each position has its own LBP whose price decays over time and can be liquidated below a threshold{" "}
              </li>
              <li>
                Buying positions costs ETH; selling returns bonding curve tokens (BCT), which you can swap back to ETH.
              </li>
              <li>
                At round end, all losing options get liquidated & winners get BCTs for their option tokens (and those of
                the losers)
              </li>
              <li>
                Lastly (not implemented in the POC) ... the &quot;token of the day&quot; is launched, all BCTs are burnt
                and holders receive the new token in exchange
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-base font-semibold text-base-content">Note</h3>
            <ul className="list-disc space-y-2 pl-5">
              <li>This frontend is wired to smart contracts deployed on MegaETH V2.</li>
            </ul>
          </section>
        </div>

        <footer className="mt-6 flex justify-end">
          <button className="btn btn-primary" onClick={onClose}>
            Let&apos;s go
          </button>
        </footer>
      </div>
    </div>
  );
}
