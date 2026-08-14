"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { AppLogo } from "@/components/app-logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const SMALL_LOGO_PX = 32;
const HEADER_TARGET_X = 32; // px-4 (16px) + half of SMALL_LOGO_PX
const HEADER_TARGET_Y = 32; // half of the h-16 (64px) header bar

function clamp(t: number) {
  return Math.max(0, Math.min(1, t));
}
function seg(p: number, a: number, b: number) {
  return clamp((p - a) / (b - a));
}
function ease(t: number) {
  return 1 - Math.pow(1 - t, 3);
}
function back(t: number) {
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}
function fadeWindow(p: number, start: number, end: number, feather = 0.08) {
  return Math.min(seg(p, start, start + feather), 1 - seg(p, end - feather, end));
}

export function LogoScrollHero() {
  const sectionRef = useRef<HTMLElement>(null);
  const mainRef = useRef<SVGPathElement>(null);
  const redRef = useRef<SVGPathElement>(null);
  const greenRef = useRef<SVGPathElement>(null);
  const logoWrapRef = useRef<HTMLDivElement>(null);
  const headerLogoRef = useRef<HTMLDivElement>(null);
  const splashRef = useRef<HTMLDivElement>(null);
  const text1Ref = useRef<HTMLDivElement>(null);
  const text2Ref = useRef<HTMLDivElement>(null);
  const text3Ref = useRef<HTMLDivElement>(null);
  const text4Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const main = mainRef.current;
    const red = redRef.current;
    const green = greenRef.current;
    const logoWrap = logoWrapRef.current;
    const headerLogo = headerLogoRef.current;
    const splash = splashRef.current;
    const text1 = text1Ref.current;
    const text2 = text2Ref.current;
    const text3 = text3Ref.current;
    const text4 = text4Ref.current;
    if (
      !section ||
      !main ||
      !red ||
      !green ||
      !logoWrap ||
      !headerLogo ||
      !splash ||
      !text1 ||
      !text2 ||
      !text3 ||
      !text4
    ) {
      return;
    }

    const len = main.getTotalLength();
    main.style.strokeDasharray = `${len}`;
    main.style.strokeDashoffset = `${len}`;

    function leaf(node: SVGPathElement, p: number, a: number, b: number) {
      const t = back(seg(p, a, b));
      node.style.opacity = `${seg(p, a, a + 0.06)}`;
      node.style.transform = `translateY(${(1 - t) * 26}px) scale(${0.72 + 0.28 * t})`;
    }

    function update() {
      const r = section!.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      const p = clamp(-r.top / (span || 1));

      const draw = ease(seg(p, 0.02, 0.5));
      main!.style.strokeDashoffset = `${len * (1 - draw)}`;
      main!.style.fillOpacity = `${seg(p, 0.42, 0.65)}`;
      leaf(red!, p, 0.5, 0.72);
      leaf(green!, p, 0.56, 0.78);

      // App name + subtitle, visible only at the very top; clears the way for the animation.
      splash!.style.opacity = `${1 - seg(p, 0, 0.06)}`;

      const pairAOpacity = fadeWindow(p, 0.06, 0.4, 0.06);
      text1!.style.opacity = `${pairAOpacity}`;
      text2!.style.opacity = `${pairAOpacity}`;

      const pairBOpacity = fadeWindow(p, 0.36, 0.78);
      text3!.style.opacity = `${pairBOpacity}`;
      text4!.style.opacity = `${pairBOpacity}`;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const big = Math.min(0.58 * vh, 0.6 * vw);
      const t = ease(seg(p, 0.8, 1));
      const size = big - (big - SMALL_LOGO_PX) * t;
      const x = (HEADER_TARGET_X - vw / 2) * t;
      const y = (HEADER_TARGET_Y - vh / 2) * t;

      logoWrap!.style.width = `${size}px`;
      logoWrap!.style.height = `${size}px`;
      logoWrap!.style.marginLeft = `${-size / 2}px`;
      logoWrap!.style.marginTop = `${-size / 2}px`;
      logoWrap!.style.transform = `translate(${x}px, ${y}px)`;

      // The header logo only appears once the animated logo lands on it.
      headerLogo!.style.opacity = `${t}`;
    }

    let queued = false;
    function onScroll() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        update();
      });
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm">
        <div ref={headerLogoRef} className="opacity-0">
          <AppLogo className="size-8 shrink-0" />
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button render={<Link href="/login" />} nativeButton={false}>
            Iniciar sesión
          </Button>
        </div>
      </div>

      <section ref={sectionRef} className="relative h-[280vh]">
        <div className="sticky top-0 h-screen overflow-hidden">
          <div
            ref={splashRef}
            className="absolute inset-0 z-40 flex flex-col items-center justify-center text-center"
          >
            <h1 className="max-w-3xl text-4xl font-bold text-balance sm:text-6xl">
              Tracker: Tu rodeo bajo control total
            </h1>
          </div>

          <div ref={logoWrapRef} className="absolute left-1/2 top-1/2 z-30 will-change-transform">
            <svg
              viewBox="0 0 800 800"
              className="block h-full w-full overflow-visible text-foreground"
            >
              <g transform="matrix(1.394366,0,0,1.394366,-151.957746,-113.295775)">
                <g transform="matrix(1.123974,0,0,1.123974,-54.984227,-76.091353)">
                  <path
                    ref={mainRef}
                    d="M213.514,423.194C264.39,370.449 316.294,311.689 363.123,254.828C361.842,231.254 341.054,234.564 325.73,231.024C300.158,225.054 273.158,202.952 270.797,178.911C289.656,193.154 312.376,199.897 335.146,205.141C356.324,210.005 381.288,207.616 396.435,227.127C398.009,223.977 405.581,216.712 416.152,212.013C441.699,200.653 462.353,220.42 488.794,204.525C499.866,249.69 454.566,307.801 404.537,268.785L265.787,424.642C279.015,443.092 292.246,461.542 305.478,479.992C350.493,479.777 400.771,505.93 401.858,558.608C386.911,528.857 350.013,508.991 287.473,518.847L213.514,423.194Z"
                    fill="currentColor"
                    fillOpacity={0}
                    stroke="currentColor"
                    strokeWidth={2.4}
                    strokeLinejoin="round"
                  />
                  <path
                    ref={redRef}
                    d="M420.491,621.092C469.36,579.924 533.72,574.214 565.465,518.277C582.19,488.79 589.533,455.368 585.322,420.283C583.1,401.78 577.79,383.81 569.859,366.689C570.169,387.671 565.656,406.963 557.159,425.047C546.716,447.306 530.339,467.568 509.668,486.771C485.968,508.808 464.898,532.257 448.729,557.475C435.913,577.468 426.119,598.607 420.491,621.092Z"
                    fill="#900a08"
                    opacity={0}
                    style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
                  />
                  <path
                    ref={greenRef}
                    d="M444.752,501.984C471.755,445.58 547.329,416.226 535.928,346.291C532.132,323.002 520.956,300.461 499.422,281.032C502.928,300.455 500.359,318.155 496.417,331.839C487.038,364.388 469.4,395.756 458.631,428.148C451.533,449.503 446.454,472.122 444.752,501.984Z"
                    fill="#89c96a"
                    opacity={0}
                    style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
                  />
                </g>
              </g>
            </svg>
          </div>

          {/* Pair A: visible immediately, higher up, bigger */}
          <div
            ref={text1Ref}
            className="absolute left-[6vw] top-[22%] max-w-xs -translate-y-1/2 sm:max-w-sm"
          >
            <p className="text-2xl font-semibold text-balance sm:text-3xl">
              Desde la manga a la industria
            </p>
            <p className="mt-2 text-base text-balance text-muted-foreground sm:text-lg">
              Automatizá la trazabilidad de tu rodeo. La información entra directo desde tu bastón
              de lectura y los PDFs del SNIG.
            </p>
          </div>
          <div
            ref={text2Ref}
            className="absolute right-[6vw] top-[22%] max-w-xs -translate-y-1/2 text-right sm:max-w-sm"
          >
            <p className="text-2xl font-semibold text-balance sm:text-3xl">
              Olvidate de las planillas
            </p>
            <p className="mt-2 text-base text-balance text-muted-foreground sm:text-lg">
              El historial de tu establecimiento se construye solo. Subí tus lecturas y procesá
              cientos de animales en segundos.
            </p>
          </div>

          {/* Pair B: takes over once pair A fades out */}
          <div
            ref={text3Ref}
            className="absolute left-[6vw] top-[42%] max-w-xs -translate-y-1/2 opacity-0 sm:max-w-sm"
          >
            <p className="text-xl font-semibold text-balance sm:text-2xl">
              Controlá los tiempos de retiro
            </p>
            <p className="mt-2 text-base text-balance text-muted-foreground">
              Registrá la sanidad y el sistema calculará automáticamente cuántos días de carencia
              le quedan a cada animal.
            </p>
          </div>
          <div
            ref={text4Ref}
            className="absolute right-[6vw] top-[42%] max-w-xs -translate-y-1/2 text-right opacity-0 sm:max-w-sm"
          >
            <p className="text-xl font-semibold text-balance sm:text-2xl">Vendé con seguridad</p>
            <p className="mt-2 text-base text-balance text-muted-foreground">
              Nunca más un rechazo en planta. Recibí alertas inmediatas si intentás enviar a faena
              un animal con residuos.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
