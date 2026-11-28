"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";
import dynamic from "next/dynamic";
import Image from "next/image";
import { LinkedInIcon } from "./ui/icons";
import { TerminalHighlight } from "./ui/TerminalHighlight";
import { CircuitUnderline } from "./ui/CircuitUnderline";
import { HoverScrambleText } from "./ui/HoverScrambleText";
import { getLenis } from "../lib/lenisInstance";
import { getScrollTargetY, power4InOut, refreshScrollTargets } from "../lib/scrollTarget";
import {
  subscribeMotionEnvironment,
  type MotionEnvironment,
} from "../lib/motionEnvironment";
import { loaderControls } from "../lib/loaderControls";
import { MOTION_FAILED_EVENT } from "../lib/motionEvents";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const InteractiveModel = dynamic(() => import("./InteractiveModel"), { ssr: false });

/* Each name renders as its own masked line: per-char spans keep the
   magnetic repulsion alive while the line-level span is what the
   opposing entrance + scroll-out parallax translate. */
const FIRST_NAME = ["T", "a", "l", "h", "a"];
const LAST_NAME = ["S", "h", "e", "i", "k", "h"];

interface HeroSectionProps {
  animate?: boolean;
  environment?: MotionEnvironment;
  motionEnabled?: boolean;
  portfolioSectionRef?: React.RefObject<HTMLElement | null>;
}

export default function HeroSection({
  animate = false,
  environment: environmentOverride,
  motionEnabled: motionOverride,
  portfolioSectionRef,
}: HeroSectionProps) {
  const runwayRef = useRef<HTMLDivElement>(null);
  const topGroupRef = useRef<HTMLSpanElement>(null);
  const bottomGroupRef = useRef<HTMLSpanElement>(null);
  const topCharRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const botCharRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const subContentRef = useRef<HTMLDivElement>(null);
  const [detectedEnvironment, setDetectedEnvironment] =
    useState<MotionEnvironment | null>(null);
  const [stageFailed, setStageFailed] = useState(false);
  const loaderSnapshot = useSyncExternalStore(
    loaderControls.subscribe,
    loaderControls.getSnapshot,
    loaderControls.getServerSnapshot,
  );
  const environment = environmentOverride ?? detectedEnvironment;
  const motionEnabled =
    motionOverride ?? environment?.desktopScrub ?? false;
  /* Main played the opposing mask-reveal entrance (and its hidden
     pre-state) on mobile too — coarse pointers join the desktop story
     here, while narrow fine-pointer windows and the pre-detection
     window (environment null) stay on the instant static reveal. */
  const entranceEnabled =
    motionEnabled || (environment?.coarsePointer ?? false);
  const webglAvailable = environment?.webglAvailable ?? true;
  const mobileStage =
    environment?.coarsePointer === true && !environment.reducedMotion;
  const desktopStage =
    motionEnabled &&
    (environment?.stageViewport ?? false) &&
    !environment?.coarsePointer &&
    !environment?.reducedMotion;
  const renderDevice = webglAvailable && (mobileStage || desktopStage);
  const mountVisualStage =
    environment != null &&
    (mobileStage || desktopStage) &&
    webglAvailable &&
    !stageFailed;
  /* Keep a static device fallback for reduced-motion, unsupported, or failed
     stages. Fine-pointer 768-899px still uses the text-only scrub story. */
  const showPoster =
    environment != null &&
    (stageFailed ||
      !webglAvailable ||
      environment.reducedMotion ||
      (!environment.coarsePointer && !environment.desktopScrub));

  useEffect(() => {
    if (environmentOverride) return;
    return subscribeMotionEnvironment(setDetectedEnvironment);
  }, [environmentOverride]);

  /* ── Magnetic character repulsion (pointer interaction) ── */
  useGSAP(() => {
    if (!motionEnabled) return;
    const runway = runwayRef.current;
    if (!runway) return;

    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const allChars = [
        ...topCharRefs.current,
        ...botCharRefs.current,
      ].filter(Boolean) as HTMLSpanElement[];
      if (!allChars.length) return;

      const setters = allChars.map((el) => ({
        x: gsap.quickSetter(el, "x", "px") as (v: number) => void,
        y: gsap.quickSetter(el, "y", "px") as (v: number) => void,
      }));

      const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
      const cur = allChars.map(() => ({ x: 0, y: 0 }));
      const tgt = allChars.map(() => ({ x: 0, y: 0 }));
      const radius = 150;
      const maxPush = 28;
      let isActive = false;

      /* Cached untransformed char centers (viewport space) — measured
         once via getBoundingClientRect, then reused on every mousemove.
         Reading rects per mousemove is expensive (forced layout) and,
         worse, rects include the chars' own live push transform, which
         moves the measured center and feeds back into the force calc
         (wobble). Subtracting the char's current applied offset (cur)
         yields the rest-position center regardless of when we measure. */
      const centers = allChars.map(() => ({ x: 0, y: 0 }));
      let measureRaf = 0;

      function measureCenters() {
        allChars.forEach((el, i) => {
          const r = el.getBoundingClientRect();
          centers[i].x = r.left + r.width / 2 - cur[i].x;
          centers[i].y = r.top + r.height / 2 - cur[i].y;
        });
      }

      function resetTargets() {
        tgt.forEach((target) => {
          target.x = 0;
          target.y = 0;
        });
      }

      function onMouseMove(e: MouseEvent) {
        if (!isActive) return;

        allChars.forEach((_, i) => {
          const cx = centers[i].x;
          const cy = centers[i].y;
          const dx = e.clientX - cx;
          const dy = e.clientY - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < radius && dist > 0) {
            const force = (1 - dist / radius) * maxPush;
            tgt[i].x = -(dx / dist) * force;
            tgt[i].y = -(dy / dist) * force;
          } else {
            tgt[i].x = 0;
            tgt[i].y = 0;
          }
        });
      }

      /* Scroll/resize can move the chars (e.g. once the sticky hero
         releases post-scroll), so re-measure then — but batched to at
         most once per frame via rAF, never per raw scroll event. */
      function onScrollOrResize() {
        if (!isActive || measureRaf) return;
        measureRaf = requestAnimationFrame(() => {
          measureRaf = 0;
          measureCenters();
        });
      }

      const tickFn = () => {
        allChars.forEach((_, i) => {
          cur[i].x = lerp(cur[i].x, tgt[i].x, 0.16);
          cur[i].y = lerp(cur[i].y, tgt[i].y, 0.16);
          setters[i].x(cur[i].x);
          setters[i].y(cur[i].y);
        });
      };

      function startInteraction() {
        if (isActive) return;
        isActive = true;
        measureCenters();
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("scroll", onScrollOrResize, { passive: true });
        window.addEventListener("resize", onScrollOrResize);
        gsap.ticker.add(tickFn);
      }

      function stopInteraction() {
        isActive = false;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("scroll", onScrollOrResize);
        window.removeEventListener("resize", onScrollOrResize);
        if (measureRaf) {
          cancelAnimationFrame(measureRaf);
          measureRaf = 0;
        }
        gsap.ticker.remove(tickFn);
        resetTargets();
        allChars.forEach((_, i) => {
          cur[i].x = 0;
          cur[i].y = 0;
          setters[i].x(0);
          setters[i].y(0);
        });
      }

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            startInteraction();
          } else {
            stopInteraction();
          }
        },
        { threshold: 0 }
      );

      observer.observe(runway);

      return () => {
        observer.disconnect();
        stopInteraction();
      };
    });

    return () => mm.revert();
  }, {
    scope: runwayRef,
    dependencies: [motionEnabled],
    revertOnUpdate: true,
  });

  /* ── Initial hidden state for entrance animation ──
     The name lines hide by offset inside their overflow-hidden masks
     (no opacity): Talha waits below its mask, Sheikh above its own,
     so the entrance is a pure opposing mask-reveal. */
  useGSAP(() => {
    try {
      if (!entranceEnabled) {
        const allChars = [
          ...topCharRefs.current,
          ...botCharRefs.current,
        ].filter(Boolean);
        gsap.set(allChars, { clearProps: "transform" });
        gsap.set([".name-part-1", ".name-part-2"], { yPercent: 0 });
        gsap.set(".hero-name-mask", { overflow: "visible" });
        gsap.set([".hero-tagline", ".hero-sub", ".hero-buttons"], { opacity: 1, y: 0 });
        return;
      }

      gsap.set(".name-part-1", { yPercent: 100 });
      gsap.set(".name-part-2", { yPercent: -100 });
      gsap.set(
        [".hero-tagline", ".hero-sub", ".hero-buttons"],
        { opacity: 0, y: -22 }
      );
    } catch {
      gsap.set([".name-part-1", ".name-part-2"], { yPercent: 0 });
      gsap.set(".hero-name-mask", { overflow: "visible" });
      gsap.set(
        [".hero-tagline", ".hero-sub", ".hero-buttons"],
        { opacity: 1, y: 0 }
      );
      window.dispatchEvent(new CustomEvent(MOTION_FAILED_EVENT));
    }
  }, {
    scope: runwayRef,
    dependencies: [entranceEnabled],
    revertOnUpdate: true,
  });

  /* ── Entrance animation (fires after preloader) ── */
  useGSAP(() => {
    if (!animate) return;

    if (!entranceEnabled) return;
    let mm: ReturnType<typeof gsap.matchMedia> | null = null;

    try {
      mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        /* Opposing mask-reveal: Talha rises UP into view while Sheikh
           drops DOWN, simultaneously. Once the lines have landed, the
           masks release (overflow: visible) so the magnetic char
           repulsion and the scroll-out fly-apart are never clipped. */
        gsap.to(".name-part-1", {
          yPercent: 0,
          ease: "power4.out",
          duration: 0.68,
        });
        gsap.to(".name-part-2", {
          yPercent: 0,
          ease: "power4.out",
          duration: 0.68,
          onComplete: () => {
            gsap.set(".hero-name-mask", { overflow: "visible" });
          },
        });

        /* Supporting copy follows the name in */
        gsap.to([".hero-tagline", ".hero-sub", ".hero-buttons"], {
          y: 0,
          opacity: 1,
          ease: "power4.out",
          duration: 0.58,
          stagger: 0.04,
          delay: 0.06,
        });
      });

      mm.add("(prefers-reduced-motion: reduce)", () => {
        /* Instant reveal — no transforms */
        gsap.set([".name-part-1", ".name-part-2"], { yPercent: 0 });
        gsap.set(".hero-name-mask", { overflow: "visible" });
        gsap.set(
          [".hero-tagline", ".hero-sub", ".hero-buttons"],
          { opacity: 1, y: 0 }
        );
      });
    } catch {
      mm?.revert();
      gsap.set([".name-part-1", ".name-part-2"], { yPercent: 0 });
      gsap.set(".hero-name-mask", { overflow: "visible" });
      gsap.set(
        [".hero-tagline", ".hero-sub", ".hero-buttons"],
        { opacity: 1, y: 0 }
      );
      window.dispatchEvent(new CustomEvent(MOTION_FAILED_EVENT));
    }

    return () => mm?.revert();
  }, {
    scope: runwayRef,
    dependencies: [animate, entranceEnabled],
    revertOnUpdate: true,
  });

  /* ── Scroll-out parallax (name flies apart, sub-content fades) ── */
  useGSAP(() => {
    const mm = gsap.matchMedia();

    if (!motionEnabled) return;
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: runwayRef.current,
          start: "top top",
          end: "bottom bottom",
          scrub: 2,
        },
      });

      // The 3D model handles its own exit via the explode shader —
      // we only animate the text columns here.
      tl.to(topGroupRef.current, { y: "-120vh", ease: "power2.in" }, 0)
        .to(bottomGroupRef.current, { y: "120vh", ease: "power2.in" }, 0)
        .to(subContentRef.current, { opacity: 0, y: 28, ease: "none", duration: 0.20 }, 0);
    });

    return () => mm.revert();
  }, {
    scope: runwayRef,
    dependencies: [motionEnabled],
    revertOnUpdate: true,
  });

  /*
   * useGSAP contexts revert in hook order when the immersive media query
   * changes. This layout effect runs after those contexts and resolves
   * the complete static composition in the same frame, preventing an old
   * entrance or pointer transform from surviving a resize/orientation change.
   * Gated on entranceEnabled (not motionEnabled): coarse pointers run the
   * main-parity entrance + fly-apart, so forcing the static pose there
   * would clobber the hidden pre-state and kill the entrance tweens.
   */
  useLayoutEffect(() => {
    if (entranceEnabled) return;

    const chars = [
      ...topCharRefs.current,
      ...botCharRefs.current,
    ].filter(Boolean);
    const groups = [topGroupRef.current, bottomGroupRef.current].filter(Boolean);

    gsap.killTweensOf([...chars, ...groups, subContentRef.current]);
    gsap.set(chars, { clearProps: "transform" });
    gsap.set(groups, { x: 0, y: 0, yPercent: 0 });
    gsap.set(".hero-name-mask", { overflow: "visible" });
    gsap.set(subContentRef.current, { opacity: 1, y: 0 });
  }, [entranceEnabled]);

  /* ── Mobile scroll-out parallax (coarse pointer only) ──
     Desktop's scroll-out above never fires here (motionEnabled is false
     for coarsePointer), so this recreates main's hero → Selected Work
     transition on the mobile pinned runway: evolution.css re-enables the
     300svh .hero-runway + sticky .hero-sticky for coarse pointers (gated
     on data-motion-ready="true"), and this scrub is main's exact desktop
     geometry — fly-apart completes across the pin's first 200svh
     ("bottom bottom"), leaving the last 100svh for the spent hero to
     release and Selected Work to scroll in.
     No opacity:0 is set on the name here, so a failure mid-tween just
     freezes the current (visible) transform.
     DECLARED AFTER the static-reset layout effect on purpose: on a
     fine→coarse environment flip both re-run in declaration order, and the
     reset's killTweensOf targets these same refs — creating the scrub last
     keeps its tweens alive (review finding). */
  useGSAP(() => {
    if (!environment?.coarsePointer) return;
    let mm: ReturnType<typeof gsap.matchMedia> | null = null;

    try {
      mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        /* Main's fly-apart verbatim: the name accelerates apart
           (power2.in) while the sub-content fades out over the first
           fifth of the exit. */
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: runwayRef.current,
            start: "top top",
            end: "bottom bottom",
            scrub: 2,
          },
        });

        tl.to(topGroupRef.current, { y: "-120vh", ease: "power2.in" }, 0)
          .to(bottomGroupRef.current, { y: "120vh", ease: "power2.in" }, 0)
          .to(
            subContentRef.current,
            { opacity: 0, y: 28, ease: "none", duration: 0.2 },
            0,
          );
      });
    } catch {
      mm?.revert();
      gsap.set([topGroupRef.current, bottomGroupRef.current], { clearProps: "transform" });
      gsap.set(subContentRef.current, { clearProps: "opacity" });
      window.dispatchEvent(new CustomEvent(MOTION_FAILED_EVENT));
    }

    return () => mm?.revert();
  }, {
    scope: runwayRef,
    dependencies: [environment?.coarsePointer, motionEnabled],
    revertOnUpdate: true,
  });

  return (
    <div ref={runwayRef} className="hero-runway hero-runway--static" id="hero">
      {/*
        The full-screen Canvas sits here as an absolute background layer.
        It covers the entire hero sticky area so shards can fly across
        the whole viewport without being clipped by any CSS column.
      */}
      {mountVisualStage && (
        <div
          className="hero-3d-layer"
          data-device={environment?.coarsePointer ? "smartphone" : "laptop"}
          aria-hidden="true"
          style={{
            display: "block",
            zIndex: loaderSnapshot.active ? 9998 : undefined,
            opacity: loaderSnapshot.active ? 1 : undefined,
          }}
        >
          <InteractiveModel
            portfolioSectionRef={portfolioSectionRef}
            renderDevice={renderDevice}
            mobile={environment?.coarsePointer ?? false}
            onFail={() => setStageFailed(true)}
          />
        </div>
      )}

      <div className="hero-sticky" style={{ pointerEvents: "none" }}>
        <div className="container">
          {/* Constrains the text to the 55fr left column */}
          <div className="hero-inner-grid">
            <div className="hero-text-col" style={{ pointerEvents: "auto" }}>
              {/* Stacked, masked name: each line lives in an
                  overflow-hidden wrapper so the opposing entrance
                  (Talha up / Sheikh down) reveals through a clean
                  mask. The masks release after the intro lands. */}
              <h1
                className="hero-name-split"
                aria-label="Talha Sheikh"
                style={{ flexDirection: "column" }}
              >
                <div className="hero-name-mask" style={{ overflow: "hidden" }}>
                  <span
                    ref={topGroupRef}
                    className="hero-char-group name-part-1"
                    aria-hidden="true"
                    style={{ display: "flex" }}
                  >
                    {FIRST_NAME.map((ch, i) => (
                      <span
                        key={`t${i}`}
                        ref={(el) => { topCharRefs.current[i] = el; }}
                        className="hero-char"
                      >
                        {ch}
                      </span>
                    ))}
                  </span>
                </div>
                <div className="hero-name-mask" style={{ overflow: "hidden" }}>
                  <span
                    ref={bottomGroupRef}
                    className="hero-char-group name-part-2"
                    aria-hidden="true"
                    style={{ display: "flex" }}
                  >
                    {LAST_NAME.map((ch, i) => (
                      <span
                        key={`b${i}`}
                        ref={(el) => { botCharRefs.current[i] = el; }}
                        className="hero-char"
                      >
                        {ch}
                      </span>
                    ))}
                  </span>
                </div>
              </h1>

              <div ref={subContentRef} className="hero-sub-content">
                <h2 className="hero-tagline">
                  <TerminalHighlight delay={0.38} color="var(--accent)" animate={animate}>AI Engineer</TerminalHighlight> &amp; <TerminalHighlight delay={0.5} color="var(--accent)" animate={animate}>MERN Stack Developer</TerminalHighlight>, building <TerminalHighlight delay={0.62} color="var(--accent-cool)" animate={animate}>intelligent, scalable software solutions</TerminalHighlight> with modern web technologies.
                </h2>

                <p className="hero-sub">
                  I&apos;m an aspiring AI Engineer and MERN Stack Developer with 2 years of MERN experience and 4 years of WordPress development experience. <CircuitUnderline delay={0.72} color="var(--accent)" animate={animate}>Open to Work</CircuitUnderline> &mdash; Available for New Opportunities.
                </p>

                <div className="hero-buttons">
                  <a
                    href="#projects"
                    className="btn btn-primary"
                    id="hero-projects-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      refreshScrollTargets(["projects"]);
                      const y = getScrollTargetY("projects", "landing");
                      if (y == null) return;
                      const lenis = getLenis();
                      if (lenis) {
                        lenis.resize();
                        lenis.scrollTo(y, {
                          duration: 1.3,
                          easing: power4InOut,
                          force: true,
                          lock: false,
                        });
                      }
                      else window.scrollTo({ top: y, behavior: "smooth" });
                    }}
                  >
                    <HoverScrambleText text="Explore featured work" />
                  </a>
                  <a
                    href="https://www.linkedin.com/in/talha-amir-sheikh/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline"
                    id="hero-linkedin-btn"
                  >
                    <LinkedInIcon size={16} />
                    <HoverScrambleText text="Connect on LinkedIn" />
                  </a>
                  <a
                    href="mailto:talhaamir.sh@gmail.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline"
                    id="hero-resume-btn"
                  >
                    <HoverScrambleText text="Email Talha" />
                    <span className="btn-arrow" aria-hidden="true">↗</span>
                  </a>
                </div>
              </div>
            </div>
            {showPoster && (
              environment?.coarsePointer ? (
                <div className="hero-phone-poster" aria-hidden="true">
                  <div className="hero-phone-poster__screen">
                    <Image
                      src="/assets/textures/bg-mobile.jpg"
                      alt=""
                      fill
                      sizes="(max-width: 767px) 42vw, 220px"
                    />
                  </div>
                </div>
              ) : (
                <div className="hero-laptop-poster" aria-hidden="true">
                  <div className="hero-laptop-poster__lid">
                    <div className="hero-laptop-poster__screen">
                      <Image
                        src="/assets/Neuro-genesis/title-card.jpg"
                        alt=""
                        fill
                        sizes="(min-width: 900px) 42vw, 82vw"
                      />
                    </div>
                  </div>
                  <div className="hero-laptop-poster__base" />
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
