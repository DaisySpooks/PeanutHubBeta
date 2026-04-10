import Image from "next/image";
import type { CSSProperties } from "react";

const FIREFLIES: Array<{
  left: string;
  top: string;
  delay: string;
  dx: string;
  dy: string;
}> = [
  { left: "8%",  top: "62%", delay: "0s",    dx: "12px",  dy: "-20px" },
  { left: "14%", top: "38%", delay: "0.9s",  dx: "-9px",  dy: "-26px" },
  { left: "23%", top: "71%", delay: "1.7s",  dx: "14px",  dy: "-13px" },
  { left: "36%", top: "48%", delay: "2.5s",  dx: "-11px", dy: "-22px" },
  { left: "47%", top: "28%", delay: "3.3s",  dx: "7px",   dy: "-31px" },
  { left: "59%", top: "58%", delay: "0.5s",  dx: "-13px", dy: "-17px" },
  { left: "71%", top: "42%", delay: "1.3s",  dx: "9px",   dy: "-23px" },
  { left: "79%", top: "67%", delay: "2.1s",  dx: "-14px", dy: "-11px" },
  { left: "87%", top: "33%", delay: "2.9s",  dx: "11px",  dy: "-29px" },
  { left: "6%",  top: "47%", delay: "3.7s",  dx: "18px",  dy: "-16px" },
  { left: "53%", top: "76%", delay: "1.9s",  dx: "-7px",  dy: "-19px" },
  { left: "92%", top: "57%", delay: "0.7s",  dx: "13px",  dy: "-21px" },
];

export default function Home() {
  return (
    <main>
      <section className="ogHero" aria-label="OG Peanut — Enter The Nutaverse">

        {/* Layer 0 — Forest background */}
        <Image
          src="/forest-bg.png"
          alt=""
          fill
          className="ogHeroBg"
          priority
        />

        {/* Layer 1 — Fog / mist */}
        <div className="ogFog ogFog1" aria-hidden="true" />
        <div className="ogFog ogFog2" aria-hidden="true" />

        {/* Layer 2 — Nutshell on the forest floor */}
        <a
          href="https://dexscreener.com/solana/gzdvsyajtfkutmaxcqtwbpkh1rsqt8vkfgjwdg1f62u8"
          className="ogNutshellWrap"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View $PEANUT token on DEX Screener"
        >
          <Image src="/nutshell.png" alt="" fill className="ogContainImg" />
        </a>

        {/* Layer 3 — Arcade machine, left side */}
        <a
          href="https://plz.veraity.com/"
          className="ogArcadeWrap"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Peaquilizer arcade — play now"
        >
          <Image src="/arcade-peaquilizer.png" alt="" fill className="ogBottomImg" />
        </a>

        {/* Layer 3 — Microphone + LIVE ON AIR sign, right side */}
        <a
          href="https://ogpeanut-radio.com/"
          className="ogMicWrap"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="OG Peanut Radio — listen live"
        >
          <Image src="/microphone-live-on-air.png" alt="" fill className="ogBottomImg" />
        </a>

        {/* Layer 4 — Character, dominant center */}
        <div className="ogCharacterWrap" aria-hidden="true">
          <Image src="/character.png" alt="" fill className="ogBottomImg" priority />
        </div>

        {/* Layer 5 — Vignette */}
        <div className="ogVignette" aria-hidden="true" />

        {/* Layer 6 — Fireflies */}
        {FIREFLIES.map((ff, i) => (
          <span
            key={i}
            className="ogFirefly"
            aria-hidden="true"
            style={{
              left: ff.left,
              top: ff.top,
              animationDelay: ff.delay,
              "--fx": ff.dx,
              "--fy": ff.dy,
            } as CSSProperties}
          />
        ))}

        {/* Layer 7 — UI chrome */}
        <div className="ogHeroUi">

          {/* Social icons — top right */}
          <div className="ogSocials">
            <a
              href="https://discord.com/invite/UPR3FZBCzn"
              target="_blank"
              rel="noopener noreferrer"
              className="ogSocialLink"
              aria-label="Join OG Peanut on Discord"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.081.114 18.104.133 18.12a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
            </a>
            <a
              href="https://x.com/OgPeanut_solana"
              target="_blank"
              rel="noopener noreferrer"
              className="ogSocialLink"
              aria-label="Follow OG Peanut on X"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          </div>

          {/* Top center — emblem, title, subtitle */}
          <div className="ogHeroTop">
            <div className="ogEmblemWrap">
              <Image src="/emblem.png" alt="OG Peanut emblem" fill className="ogContainImg" />
            </div>
            <h1 className="ogTitle">OG Peanut</h1>
            <p className="ogSubtitle">Enter The Nutaverse</p>
          </div>

          {/* Bottom center — MINT NOW */}
          <div className="ogMintBtnWrap">
            <a
              href="https://www.launchmynft.io/collections/CmTidAhU1QEutyZPFWcqwBQ44ScJhNAGH2J9hm5zonP6/aW6JZwq0ZErg7BGlXbKe"
              className="ogMintBtn"
              target="_blank"
              rel="noopener noreferrer"
            >
              MINT NOW
            </a>
          </div>

        </div>
      </section>
    </main>
  );
}
