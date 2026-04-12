import Image from "next/image";

const fireflies = [
  { left: "6%", top: "26%", size: "0.42rem", duration: "10.5s", delay: "-1.2s", driftX: "22px", driftY: "-42px", swayX: "-14px" },
  { left: "10%", top: "58%", size: "0.34rem", duration: "13.8s", delay: "-5.1s", driftX: "18px", driftY: "-38px", swayX: "12px" },
  { left: "14%", top: "76%", size: "0.38rem", duration: "11.6s", delay: "-3.4s", driftX: "-20px", driftY: "-34px", swayX: "14px" },
  { left: "22%", top: "68%", size: "0.3rem", duration: "14.4s", delay: "-7.2s", driftX: "16px", driftY: "-44px", swayX: "-10px" },
  { left: "31%", top: "82%", size: "0.32rem", duration: "12.2s", delay: "-2.6s", driftX: "-15px", driftY: "-30px", swayX: "10px" },
  { left: "68%", top: "74%", size: "0.34rem", duration: "15.2s", delay: "-9.4s", driftX: "21px", driftY: "-40px", swayX: "-12px" },
  { left: "78%", top: "24%", size: "0.4rem", duration: "10.8s", delay: "-4.7s", driftX: "-18px", driftY: "-42px", swayX: "13px" },
  { left: "84%", top: "54%", size: "0.3rem", duration: "13.4s", delay: "-6.3s", driftX: "17px", driftY: "-36px", swayX: "-13px" },
  { left: "90%", top: "72%", size: "0.42rem", duration: "11.1s", delay: "-8.6s", driftX: "-22px", driftY: "-44px", swayX: "12px" },
  { left: "94%", top: "40%", size: "0.34rem", duration: "14.8s", delay: "-1.9s", driftX: "19px", driftY: "-32px", swayX: "-11px" },
  { left: "7%", top: "86%", size: "0.28rem", duration: "12.9s", delay: "-6.7s", driftX: "13px", driftY: "-28px", swayX: "8px" },
  { left: "88%", top: "86%", size: "0.3rem", duration: "15.4s", delay: "-4.2s", driftX: "-14px", driftY: "-30px", swayX: "-9px" },
];

export default function Home() {
  return (
    <main className="bg-[var(--page-bg)] text-[var(--text-primary)]">
      <section className="relative isolate min-h-screen overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="/images/forest-bg.png"
            alt="Dark forest atmosphere"
            fill
            priority
            sizes="100vw"
            className="object-cover object-[50%_24%] sm:object-[50%_20%] lg:object-center"
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_22%,rgba(255,225,165,0.15),transparent_22%),radial-gradient(circle_at_50%_64%,rgba(255,191,94,0.14),transparent_16%),linear-gradient(180deg,rgba(4,4,6,0.58),rgba(4,4,6,0.2)_22%,rgba(4,4,6,0.36)_48%,rgba(4,4,6,0.86)_78%,rgba(4,4,6,0.97))]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_32%,rgba(0,0,0,0.56)_88%)]" />
        </div>
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {fireflies.map((firefly, index) => (
            <span
              key={`${firefly.left}-${firefly.top}`}
              className="firefly"
              style={
                {
                  left: firefly.left,
                  top: firefly.top,
                  width: firefly.size,
                  height: firefly.size,
                  animationDuration: firefly.duration,
                  animationDelay: firefly.delay,
                  ["--drift-x" as string]: firefly.driftX,
                  ["--drift-y" as string]: firefly.driftY,
                  ["--sway-x" as string]: firefly.swayX,
                  ["--pulse-duration" as string]: `${4.5 + (index % 4) * 0.9}s`,
                  ["--pulse-delay" as string]: `${-0.8 * index}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>

        <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 pb-8 pt-4 sm:px-10 sm:pt-6 lg:px-12 lg:pt-8">
          <div className="flex flex-col items-center text-center lg:hidden">
            <div className="flex w-full justify-end">
              <div className="flex items-center gap-1 sm:gap-1.5">
                <a
                  href="https://x.com/OgPeanut_solana"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-6 cursor-pointer items-center justify-center rounded-full border border-amber-100/12 bg-black/18 px-2 text-[9px] font-medium tracking-[0.01em] text-[#ead8b7]/70 transition-colors duration-300 hover:bg-black/26 hover:text-[#f5cd8c] [font-family:Georgia,'Times_New_Roman',serif]"
                >
                  X / Twitter
                </a>
                <a
                  href="https://discord.com/invite/UPR3FZBCzn"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-6 cursor-pointer items-center justify-center rounded-full border border-amber-100/12 bg-black/18 px-2 text-[9px] font-medium tracking-[0.01em] text-[#ead8b7]/70 transition-colors duration-300 hover:bg-black/26 hover:text-[#f5cd8c] [font-family:Georgia,'Times_New_Roman',serif]"
                >
                  Discord
                </a>
              </div>
            </div>

            <div className="mt-2 flex flex-col items-center">
              <div className="relative h-18 w-32 sm:h-20 sm:w-36">
                <Image
                  src="/images/emblem-v2.png"
                  alt="Peanut Hub emblem"
                  fill
                  sizes="144px"
                  className="object-contain drop-shadow-[0_0_18px_rgba(255,181,63,0.22)]"
                />
              </div>

              <div className="relative mt-[-2rem] w-[120%] max-w-[28rem] sm:mt-[-2.15rem] sm:w-[119%] sm:max-w-[32rem]">
                <div className="relative mx-auto aspect-[5/2] w-full">
                  <Image
                    src="/images/hero-title-nutaverse.png"
                    alt="OG Peanut, Enter the Nutaverse, Peanut Protocol"
                    fill
                    sizes="(min-width: 640px) 32rem, 120vw"
                    className="object-contain"
                  />
                </div>
              </div>
            </div>

            <div className="relative mt-3 h-[25rem] w-full max-w-sm sm:h-[27.5rem] sm:max-w-md">
              <div className="absolute bottom-[4.9rem] left-[9%] z-10 w-[40%] max-w-[8.9rem] sm:left-[10%] sm:max-w-[10.2rem]">
                <a
                  href="https://plz.veraity.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block cursor-pointer"
                >
                  <div className="relative aspect-[4/5]">
                    <div className="absolute bottom-[2%] left-1/2 h-[12%] w-[60%] -translate-x-1/2 rounded-[50%] bg-black/48 blur-md" />
                    <Image
                      src="/images/arcade-peaquilizer.png"
                      alt="Arcade prop"
                      fill
                      sizes="128px"
                      className="object-contain object-bottom opacity-[0.95] drop-shadow-[0_14px_20px_rgba(0,0,0,0.42)] transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  </div>
                </a>
              </div>

              <div className="absolute bottom-[4.35rem] left-1/2 z-20 w-[47%] max-w-[10.9rem] -translate-x-1/2 sm:bottom-[4.5rem] sm:max-w-[12.5rem]">
                <div className="relative aspect-[4/5]">
                  <div className="absolute bottom-[0.8%] left-1/2 h-[5.5%] w-[42%] -translate-x-1/2 rounded-[50%] bg-black/52 blur-[5px]" />
                  <div className="absolute bottom-[1.8%] left-1/2 h-[10%] w-[56%] -translate-x-1/2 rounded-[50%] bg-black/48 blur-md" />
                  <div className="absolute bottom-[3%] left-1/2 h-[16%] w-[70%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(8,8,10,0.42),rgba(8,8,10,0.2)_45%,transparent_78%)] blur-lg" />
                  <div className="absolute bottom-[4%] left-1/2 h-[24%] w-[88%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(10,10,12,0.24),rgba(10,10,12,0.1)_48%,transparent_80%)] blur-xl" />
                  <div className="absolute bottom-[1.4%] left-[43%] h-[2.8%] w-[12%] -translate-x-1/2 rounded-[50%] bg-black/34 blur-[4px]" />
                  <div className="absolute bottom-[1.4%] left-[57%] h-[2.8%] w-[12%] -translate-x-1/2 rounded-[50%] bg-black/34 blur-[4px]" />
                  <Image
                    src="/images/character-bananas-test.png"
                    alt="Peanut Hub character"
                    fill
                    sizes="(min-width: 640px) 13rem, 56vw"
                    className="object-contain object-bottom brightness-[0.88] contrast-[0.96] saturate-[0.92] drop-shadow-[0_10px_14px_rgba(0,0,0,0.22)] drop-shadow-[0_16px_24px_rgba(0,0,0,0.3)]"
                  />
                  <div className="pointer-events-none absolute bottom-[2%] left-1/2 h-[18%] w-[68%] -translate-x-1/2 rounded-[50%] bg-[linear-gradient(180deg,rgba(8,8,10,0),rgba(8,8,10,0.12)_34%,rgba(8,8,10,0.26)_72%,rgba(8,8,10,0.3))] blur-md" />
                  <div className="pointer-events-none absolute bottom-[0.4%] left-1/2 h-[11%] w-[60%] -translate-x-1/2 rounded-[50%] bg-[linear-gradient(180deg,rgba(14,10,6,0),rgba(14,10,6,0.12)_36%,rgba(14,10,6,0.2)_72%,rgba(14,10,6,0.24))] blur-sm" />
                </div>
              </div>

              <div className="absolute bottom-[5rem] right-[12%] z-10 w-[11%] max-w-[2.9rem] sm:right-[12%] sm:max-w-[3.4rem]">
                <a
                  href="https://ogpeanut-radio.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block cursor-pointer"
                >
                  <div className="relative aspect-[3/5]">
                    <div className="absolute bottom-[2.5%] left-1/2 h-[9%] w-[40%] -translate-x-1/2 rounded-[50%] bg-black/30 blur-md" />
                    <Image
                      src="/images/microphone-live-on-air.png"
                      alt="Microphone prop"
                      fill
                      sizes="52px"
                      className="object-contain object-bottom opacity-[0.9] drop-shadow-[0_12px_18px_rgba(0,0,0,0.34)] transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  </div>
                </a>
              </div>

              <div className="absolute bottom-[3rem] left-1/2 h-16 w-[94%] max-w-sm -translate-x-1/2 rounded-[50%] bg-[radial-gradient(circle,rgba(255,182,77,0.24),rgba(255,182,77,0.08)_42%,transparent_72%)] blur-2xl" />
              <div className="absolute bottom-[3.25rem] left-1/2 h-[20%] w-[98%] max-w-sm -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(9,9,10,0.34),rgba(9,9,10,0.14)_46%,transparent_76%)] blur-xl" />

              <a
                href="https://www.launchmynft.io/collections/CmTidAhU1QEutyZPFWcqwBQ44ScJhNAGH2J9hm5zonP6/aW6JZwq0ZErg7BGlXbKe"
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-[0.25rem] left-1/2 z-30 inline-flex min-h-9 -translate-x-1/2 items-center justify-center rounded-2xl border border-amber-200/28 bg-[linear-gradient(180deg,rgba(109,58,27,0.74),rgba(61,31,14,0.92))] px-5 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#f8dfb6] shadow-[0_12px_24px_rgba(0,0,0,0.36)] transition-transform duration-300 hover:-translate-y-0.5 [font-family:Georgia,'Times_New_Roman',serif]"
              >
                Mint your PP
              </a>
            </div>

            <div
              id="welcome"
              className="mx-auto mt-4 flex w-full max-w-sm flex-col items-center gap-4 border-t border-amber-100/14 pt-5 text-center"
            >
              <p className="max-w-sm text-sm leading-7 text-white/58">
                The forest keeps the stage dim, the props keep it alive, and the
                rest of the world waits just outside the lantern glow.
              </p>
              <footer className="text-[11px] uppercase tracking-[0.34em] text-white/36">
                Peanut Hub
              </footer>
            </div>
          </div>

          <div className="hidden lg:flex lg:flex-1 lg:flex-col lg:items-center lg:text-center">
            <div className="lg:h-2 lg:flex-none" />

            <div className="mx-auto flex w-full max-w-5xl flex-col items-center text-center">
              <div className="flex w-full items-center justify-center">
                <div className="relative h-20 w-36 sm:h-24 sm:w-44 lg:h-28 lg:w-52">
                  <Image
                    src="/images/emblem-v2.png"
                    alt="Peanut Hub emblem"
                    fill
                    sizes="224px"
                    className="object-contain drop-shadow-[0_0_22px_rgba(255,181,63,0.24)]"
                  />
                </div>
              </div>

              <div className="relative mt-[-2.25rem] w-[122%] max-w-[60rem] sm:mt-[-2.5rem] sm:w-[124%] lg:mt-[-3rem] lg:w-[122%]">
                <div className="relative mx-auto aspect-[5/2] w-full">
                  <Image
                    src="/images/hero-title-nutaverse.png"
                    alt="OG Peanut, Enter the Nutaverse, Peanut Protocol"
                    fill
                    sizes="(min-width: 1024px) 60rem, 122vw"
                    className="object-contain"
                  />
                </div>
              </div>

              <div className="relative mt-1 h-[24rem] w-full max-w-5xl sm:mt-2 sm:h-[29rem] lg:mt-2 lg:h-[29rem]">
                <div className="absolute bottom-[2.25rem] left-[-8%] z-10 w-[38%] max-w-[13.75rem] sm:bottom-[3.25rem] sm:left-[-4%] sm:max-w-[16.75rem] lg:bottom-[3.75rem] lg:left-[1%] lg:max-w-[19rem]">
                  <a
                    href="https://plz.veraity.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block cursor-pointer"
                  >
                    <div className="relative aspect-[4/5]">
                      <div className="absolute bottom-[4%] left-1/2 h-[10%] w-[48%] -translate-x-1/2 rounded-[50%] bg-black/38 blur-md" />
                      <Image
                        src="/images/arcade-peaquilizer.png"
                        alt="Arcade prop"
                        fill
                        sizes="(min-width: 1024px) 240px, 28vw"
                        className="object-contain object-bottom opacity-[0.95] drop-shadow-[0_14px_20px_rgba(0,0,0,0.42)] transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    </div>
                  </a>
                </div>

                <div className="absolute bottom-[1rem] left-[46%] z-20 w-[43%] max-w-[16.75rem] -translate-x-1/2 sm:bottom-[1.75rem] sm:max-w-[20.5rem] lg:bottom-[2rem] lg:max-w-[23rem]">
                  <div className="relative aspect-[4/5]">
                    <div className="absolute bottom-[2%] left-1/2 h-[13%] w-[56%] -translate-x-1/2 rounded-[50%] bg-black/56 blur-md" />
                    <div className="absolute bottom-[1%] left-1/2 h-[7%] w-[34%] -translate-x-1/2 rounded-[50%] bg-black/34 blur-sm" />
                    <div className="absolute bottom-[6%] left-1/2 h-[24%] w-[66%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(10,10,12,0.34),rgba(10,10,12,0.16)_42%,transparent_76%)] blur-lg" />
                    <div className="absolute bottom-[10%] left-1/2 h-[34%] w-[74%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(12,12,14,0.18),rgba(12,12,14,0.08)_48%,transparent_78%)] blur-xl" />
                    <div className="absolute bottom-[0.75%] left-1/2 h-[4.5%] w-[38%] -translate-x-1/2 rounded-[50%] bg-black/42 blur-[6px]" />
                    <div className="absolute bottom-[1.4%] left-[43%] h-[2.8%] w-[12%] -translate-x-1/2 rounded-[50%] bg-black/34 blur-[4px]" />
                    <div className="absolute bottom-[1.4%] left-[57%] h-[2.8%] w-[12%] -translate-x-1/2 rounded-[50%] bg-black/34 blur-[4px]" />
                    <Image
                      src="/images/character-bananas-test.png"
                      alt="Peanut Hub character"
                      fill
                      sizes="(min-width: 1024px) 460px, 52vw"
                      className="object-contain object-bottom brightness-[0.88] contrast-[0.96] saturate-[0.92] drop-shadow-[0_10px_14px_rgba(0,0,0,0.22)] drop-shadow-[0_16px_24px_rgba(0,0,0,0.3)]"
                    />
                    <div className="pointer-events-none absolute bottom-[3%] left-1/2 h-[30%] w-[62%] -translate-x-1/2 rounded-[50%] bg-[linear-gradient(180deg,rgba(8,8,10,0),rgba(8,8,10,0.08)_30%,rgba(8,8,10,0.22)_68%,rgba(8,8,10,0.28))] blur-md" />
                    <div className="pointer-events-none absolute bottom-[0.5%] left-1/2 h-[10%] w-[54%] -translate-x-1/2 rounded-[50%] bg-[linear-gradient(180deg,rgba(14,10,6,0),rgba(14,10,6,0.1)_36%,rgba(14,10,6,0.18)_72%,rgba(14,10,6,0.22))] blur-sm" />
                  </div>
                </div>

                <div className="absolute bottom-[2rem] right-[-1%] z-10 w-[14%] max-w-[5.75rem] sm:bottom-[2.75rem] sm:right-[3%] sm:max-w-[6.75rem] lg:bottom-[3.25rem] lg:right-[7%] lg:max-w-[8rem]">
                  <a
                    href="https://ogpeanut-radio.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block cursor-pointer"
                  >
                    <div className="relative aspect-[3/5]">
                      <div className="absolute bottom-[3%] left-1/2 h-[8%] w-[34%] -translate-x-1/2 rounded-[50%] bg-black/28 blur-md" />
                      <Image
                        src="/images/microphone-live-on-air.png"
                        alt="Microphone prop"
                        fill
                        sizes="(min-width: 1024px) 180px, 22vw"
                        className="object-contain object-bottom opacity-[0.9] drop-shadow-[0_12px_18px_rgba(0,0,0,0.34)] transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    </div>
                  </a>
                </div>

                <div className="absolute bottom-0 left-1/2 h-16 w-[72%] max-w-3xl -translate-x-1/2 rounded-[50%] bg-[radial-gradient(circle,rgba(255,182,77,0.32),rgba(255,182,77,0.08)_42%,transparent_72%)] blur-2xl" />
              </div>

              <a
                href="https://www.launchmynft.io/collections/CmTidAhU1QEutyZPFWcqwBQ44ScJhNAGH2J9hm5zonP6/aW6JZwq0ZErg7BGlXbKe"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex min-h-14 items-center justify-center rounded-2xl border border-amber-200/28 bg-[linear-gradient(180deg,rgba(109,58,27,0.74),rgba(61,31,14,0.92))] px-8 text-lg font-semibold uppercase tracking-[0.18em] text-[#f8dfb6] shadow-[0_12px_24px_rgba(0,0,0,0.36)] transition-transform duration-300 hover:-translate-y-0.5 [font-family:Georgia,'Times_New_Roman',serif]"
              >
                Mint your PP
              </a>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <a
                  href="https://x.com/OgPeanut_solana"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-amber-100/18 bg-black/18 px-5 text-sm font-medium tracking-[0.08em] text-[#ead8b7]/86 transition-colors duration-300 hover:bg-black/28 hover:text-[#f5cd8c] [font-family:Georgia,'Times_New_Roman',serif]"
                >
                  X / Twitter
                </a>
                <a
                  href="https://discord.com/invite/UPR3FZBCzn"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-amber-100/18 bg-black/18 px-5 text-sm font-medium tracking-[0.08em] text-[#ead8b7]/86 transition-colors duration-300 hover:bg-black/28 hover:text-[#f5cd8c] [font-family:Georgia,'Times_New_Roman',serif]"
                >
                  Discord
                </a>
              </div>
            </div>

            <div
              id="welcome"
              className="mx-auto mt-10 flex w-full max-w-3xl flex-col items-center gap-4 border-t border-amber-100/14 pt-6 text-center sm:mt-12"
            >
              <p className="max-w-2xl text-sm leading-7 text-white/58 sm:text-base">
                The forest keeps the stage dim, the props keep it alive, and the
                rest of the world waits just outside the lantern glow.
              </p>
              <footer className="text-[11px] uppercase tracking-[0.34em] text-white/36">
                Peanut Hub
              </footer>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
