/* eslint-disable react-hooks/immutability */
"use client";

import { useRef, useMemo, useEffect, useState, useCallback, Suspense, Component } from "react";
import type { ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  useGLTF,
  useTexture,
  Environment,
  Lightformer,
  PerformanceMonitor,
  RoundedBox,
} from "@react-three/drei";
import * as THREE from "three";
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { BurnPlane } from "./BurnTransition";
import { ObsidianPlane } from "./PreLoader";
import { GlProbe } from "./MemProbe";
import { loaderControls } from "../lib/loaderControls";
import { resolveAdaptiveQuality } from "../lib/motionEnvironment";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// Preload assets outside component render loop.
// Self-hosted (three's bundled decoder) — a gstatic outage/block must not
// take down the hero; the GLB would otherwise dead-end into the preloader's
// 9s failsafe.
const DRACO_DECODER_PATH = "/draco/";
if (
  typeof window !== "undefined" &&
  window.matchMedia("(pointer: fine)").matches
) {
  useGLTF.preload("/assets/hardware_laptop.glb", DRACO_DECODER_PATH);
}
/* Header captures are CPU-only (drawn into the boot canvas — never
   GPU-sampled), so they load via ImageLoader instead of useTexture: same
   DefaultLoadingManager registration (the PreLoader manifest gate DEPENDS
   on that — see PreLoader.tsx header), no ~27MB dead GPU upload. Module scope
   so both fetches register with the manifest as soon as the module loads. */
let bgImage: HTMLImageElement | null = null;
let bgMobileImage: HTMLImageElement | null = null;
const bgImagesPromise =
  typeof window === "undefined"
    ? null
    : Promise.all([
        new THREE.ImageLoader()
          .loadAsync("/assets/textures/bg.jpg")
          .then((image) => { bgImage = image; }),
        new THREE.ImageLoader()
          .loadAsync("/assets/textures/bg-mobile.jpg")
          .then((image) => { bgMobileImage = image; }),
      ]).catch((error: unknown) => {
        console.error("Failed to load a laptop header texture.", error);
      });
useTexture.preload("/assets/textures/Mac Keyboard.jpg");

/* ── Boot-screen canvas dimensions ── */
const BOOT_W = 1536;
const BOOT_H = 987;
const MOBILE_CAPTURE_WIDTH = 390;
const MOBILE_CAPTURE_HEIGHT = 844;
const MOBILE_CAPTURE_HEADING_X = 24;
const MOBILE_CAPTURE_HEADING_Y = 110.45;

/* ── Phase thresholds (hero scroll progress, 0→1) ── */
const BOOT_P1 = 0.27;
const BOOT_P2 = 0.50;
// End of the header fade-in — completes before the camera zoom starts.
const BOOT_P3 = 0.62;

const COVER_OVERSHOOT = 0.90;

// Length (in vh of scroll) of the velocity-matched, pixel-locked dissolve
function cappedDpr(): number {
  return resolveAdaptiveQuality().dpr;
}
// at the end of the hero trigger — see the timeline header comment below.
const MATCH_WINDOW_VH = 10;

/* ─────────────────────────────────────────────────────────────────────
   BOOT-SCREEN DRAWING — pure function, called from useFrame.
   ───────────────────────────────────────────────────────────────────── */
function drawBootScreen(
  ctx: CanvasRenderingContext2D,
  progress: number,
  clockTime: number,
  bgImage: HTMLImageElement | ImageBitmap | null,
  prefersReduced: boolean,
  mobile: boolean,
): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0D0B09";
  ctx.fillRect(0, 0, W, H);

  if (progress <= 0) return;

  // ── Phase 1: spinning-dots (BOOT_P1–BOOT_P2) ──────────────────────
  if (!prefersReduced && progress >= BOOT_P1 && progress < BOOT_P2) {
    const dp = (progress - BOOT_P1) / (BOOT_P2 - BOOT_P1);
    const fadeIn  = Math.min(1, dp / 0.15);
    const fadeOut = 1 - Math.min(1, Math.max(0, (dp - 0.85) / 0.15));
    const alpha   = fadeIn * fadeOut;

    if (alpha > 0) {
      ctx.save();
      ctx.globalAlpha = alpha;

      const cx   = W / 2;
      const cy   = H / 2;
      const ring = Math.min(W, H) * 0.065;
      const dr   = Math.min(W, H) * 0.012;
      const N    = 8;
      const angle = clockTime * 2.5;

      for (let i = 0; i < N; i++) {
        const t  = i / N;
        const da = 0.15 + 0.85 * Math.pow(t, 1.5);
        const a  = t * Math.PI * 2 + angle;

        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * ring, cy + Math.sin(a) * ring, dr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${da})`;
        ctx.fill();
      }

      ctx.restore();
    }
    return;
  }

  // ── Phase 2: header bitmap fade-in (BOOT_P2–BOOT_P3) ──────────────
  if (progress >= BOOT_P2 && bgImage) {
    const raw = (progress - BOOT_P2) / (BOOT_P3 - BOOT_P2);
    const t   = Math.max(0, Math.min(1, raw));
    const alpha = t * t * (3 - 2 * t);

    if (alpha <= 0) return;

    const imgW = "naturalWidth" in bgImage
      ? (bgImage as HTMLImageElement).naturalWidth
      : (bgImage as ImageBitmap).width;
    const imgH = "naturalHeight" in bgImage
      ? (bgImage as HTMLImageElement).naturalHeight
      : (bgImage as ImageBitmap).height;

    if (imgW > 0 && imgH > 0) {
      const scale = mobile
        ? Math.min(W / imgW, H / imgH)
        : Math.max(W / imgW, H / imgH) * COVER_OVERSHOOT;
      const dx    = (W - imgW * scale) / 2;
      const dy    = (H - imgH * scale) / 2;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(bgImage as CanvasImageSource, dx, dy, imgW * scale, imgH * scale);
      ctx.restore();
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────
   DEVICE MODELS
   ───────────────────────────────────────────────────────────────── */
function LaptopModel({
  screenTexture,
  hingeRef,
}: {
  screenTexture: THREE.Texture;
  hingeRef: React.RefObject<THREE.Group | null>;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { nodes, materials } = useGLTF("/assets/hardware_laptop.glb", DRACO_DECODER_PATH) as any;
  const keyboardTex = useTexture("/assets/textures/Mac Keyboard.jpg");

  useMemo(() => {
    if (keyboardTex) {
      keyboardTex.flipY      = false;
      keyboardTex.colorSpace = THREE.SRGBColorSpace;
    }

    if (materials.Image) {
      materials.Image.map              = null;
      materials.Image.color?.set?.("#000000");
      materials.Image.emissiveMap      = screenTexture;
      materials.Image.emissive         = new THREE.Color("#ffffff");
      materials.Image.emissiveIntensity = 1.0;
      materials.Image.toneMapped       = false;
      materials.Image.metalness        = 0;
      materials.Image.roughness        = 1;
      materials.Image.needsUpdate      = true;
    }
    if (materials.Screen) {
      materials.Screen.roughness = 0.16;
      materials.Screen.metalness = 0.42;
      materials.Screen.envMapIntensity = 1.25;
    }
    if (materials.Keys) {
      materials.Keys.map       = keyboardTex;
      materials.Keys.roughness = 0.5;
      materials.Keys.metalness = 0.1;
      materials.Keys.needsUpdate = true;
    }
    if (materials.Laptop) {
      materials.Laptop.roughness = 0.22;
      materials.Laptop.metalness = 0.78;
      materials.Laptop.envMapIntensity = 1.2;
      materials.Laptop.color.set("#e4e2dc");
    }
    if (materials.Keyboard) {
      materials.Keyboard.roughness = 0.5;
      materials.Keyboard.metalness = 0.1;
    }
  }, [keyboardTex, materials, screenTexture]);

  return (
    <group scale={[10, 10, 10]} position={[0, -0.65, 0]}>
      <primitive object={nodes.Base_Chassis} />
      <group ref={hingeRef} position={[0, 0.008614, -0.10311]}>
        <primitive object={nodes.Lid_Screen} position={[0, -0.008614, 0.10311]} />
      </group>
    </group>
  );
}

function SmartphoneModel({ screenTexture }: { screenTexture: THREE.Texture }) {
  return (
    <group position={[0, 0.6879, 0]}>
      <RoundedBox
        args={[1.22, 2.62, 0.15]}
        radius={0.16}
        smoothness={4}
        position={[0, 0, -0.9389]}
        castShadow
        receiveShadow
      >
        <meshPhysicalMaterial
          color="#cfc6b4"
          metalness={0.9}
          roughness={0.16}
          clearcoat={1}
          clearcoatRoughness={0.08}
        />
      </RoundedBox>
      <RoundedBox
        args={[1.15, 2.51, 0.018]}
        radius={0.135}
        smoothness={4}
        position={[0, 0, -0.8569]}
      >
        <meshPhysicalMaterial
          color="#020306"
          metalness={0.12}
          roughness={0.1}
          clearcoat={1}
          clearcoatRoughness={0.04}
        />
      </RoundedBox>
      <mesh position={[0, 0, -0.8449]}>
        <planeGeometry args={[1.065, 2.31]} />
        <meshBasicMaterial
          map={screenTexture}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <RoundedBox
        args={[0.3, 0.072, 0.014]}
        radius={0.036}
        smoothness={8}
        position={[0, 1.12, -0.8389]}
      >
        <meshBasicMaterial color="#020305" />
      </RoundedBox>
      <mesh position={[0.088, 1.12, -0.830]}>
        <sphereGeometry args={[0.014, 20, 16]} />
        <meshPhysicalMaterial
          color="#18243a"
          metalness={0.7}
          roughness={0.12}
          clearcoat={1}
        />
      </mesh>
      <RoundedBox
        args={[0.025, 0.3, 0.065]}
        radius={0.012}
        smoothness={6}
        position={[-0.62, 0.68, -0.94]}
      >
        <meshStandardMaterial color="#d9c8a9" metalness={0.9} roughness={0.18} />
      </RoundedBox>
      <RoundedBox
        args={[0.025, 0.2, 0.065]}
        radius={0.012}
        smoothness={6}
        position={[0.62, 0.7, -0.94]}
      >
        <meshStandardMaterial color="#d9c8a9" metalness={0.9} roughness={0.18} />
      </RoundedBox>
      <RoundedBox
        args={[0.025, 0.2, 0.065]}
        radius={0.012}
        smoothness={6}
        position={[-0.62, 0.27, -0.94]}
      >
        <meshStandardMaterial color="#d9c8a9" metalness={0.9} roughness={0.18} />
      </RoundedBox>
      <RoundedBox
        args={[0.4, 0.43, 0.05]}
        radius={0.085}
        smoothness={8}
        position={[-0.34, 0.96, -1.035]}
      >
        <meshPhysicalMaterial color="#c5b495" metalness={0.72} roughness={0.2} />
      </RoundedBox>
      {[
        [-0.46, 1.055],
        [-0.23, 1.055],
        [-0.46, 0.835],
      ].map(([x, y]) => (
        <mesh
          key={`${x}-${y}`}
          position={[x, y, -1.067]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[0.072, 0.072, 0.02, 32]} />
          <meshStandardMaterial color="#d8c7a8" metalness={0.85} roughness={0.18} />
        </mesh>
      ))}
      {[
        [-0.46, 1.055],
        [-0.23, 1.055],
        [-0.46, 0.835],
      ].map(([x, y]) => (
        <mesh
          key={`lens-${x}-${y}`}
          position={[x, y, -1.081]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[0.058, 0.058, 0.02, 32]} />
          <meshPhysicalMaterial
            color="#080d18"
            metalness={0.68}
            roughness={0.08}
            clearcoat={1}
          />
        </mesh>
      ))}
      <mesh
        position={[-0.23, 0.835, -1.067]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[0.026, 0.026, 0.02, 24]} />
        <meshBasicMaterial color="#f3e7d0" />
      </mesh>
    </group>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   SCROLL-SCRUBBED DEVICE
   ───────────────────────────────────────────────────────────────── */
function DeviceScene({
  canvasWrapperDOMRef,
  portfolioSectionRef,
  mobile = false,
  lowPerf = false,
  parallaxScale = 1,
  onReady,
}: {
  canvasWrapperDOMRef: React.RefObject<HTMLDivElement | null>;
  portfolioSectionRef?: React.RefObject<HTMLElement | null>;
  mobile?: boolean;
  lowPerf?: boolean;
  parallaxScale?: number;
  onReady: () => void;
}) {
  const globalContainerRef  = useRef<THREE.Group>(null);
  const lidHingeGroupRef    = useRef<THREE.Group>(null);
  const parallaxGroupRef    = useRef<THREE.Group>(null);
  // Persistent (unfaded) pointer-parallax accumulator. The applied group
  // rotation is this × fade, so fade can force it to exactly 0 at cover time.
  const parallaxCur         = useRef({ x: 0, y: 0 });
  // Manual pointer tracker (normalized -1..1, R3F convention: x right+, y up+).
  // The canvas is pointer-events:none (see InteractiveModel wrapper) so
  // state.pointer never updates from real input — this window listener
  // replaces it for the parallax below.
  const pointerRef          = useRef({ x: 0, y: 0 });
  const { camera, size, invalidate } = useThree();
  /* Live mirror for coverZ: ScrollTrigger's invalidateOnRefresh re-evaluates
     function-based values on every refresh (which resize triggers), so the
     scrub setup below must NOT depend on `size` — each PerformanceMonitor
     DPR flip changed its identity and re-ran the setup, stacking scrub
     ScrollTriggers (measured 45 on #hero) until the tab OOM'd. */
  const sizeRef = useRef(size);
  // eslint-disable-next-line react-hooks/refs -- Intentional: cross-root ScrollTrigger.refresh() can read coverZ before effects flush.
  sizeRef.current = size;

  useEffect(() => {
    if (!mobile) return;
    camera.position.z = Math.max(
      6.5,
      5 / (size.width / Math.max(1, size.height)),
    );
    invalidate();
  }, [camera, invalidate, mobile, size.height, size.width]);

  const bootProgressRef     = useRef(0);
  const lastBootProgressRef = useRef(-1);
  // Timestamp of the last scroll event — kept only as a short jitter grace now;
  // the demand loop is really held open by the scrub tween's own activity below.
  const scrollSettleRef     = useRef(0);
  // The main scrub timeline's ScrollTrigger, captured so the boot useFrame can
  // keep rendering until its scrub tween has actually finished easing (a fixed
  // timeout under-shoots the ease tail → the device entry stalls just short).
  const scrollTriggerRef    = useRef<ScrollTrigger | null>(null);

  const prefersReduced = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  /* ── Boot-screen canvas + CanvasTexture ── */
  const boot = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width  = mobile ? 768 : BOOT_W;
    canvas.height = mobile ? 1664 : BOOT_H;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#0D0B09";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY       = mobile;
    tex.colorSpace  = THREE.SRGBColorSpace;
    // No mips: −33% GPU memory and no per-upload mip-chain regen (the dots
    // phase uploads per frame) — the screen is viewed ≥ native scale in every
    // detail-bearing phase, so mip filtering buys nothing.
    tex.generateMipmaps = false;
    tex.minFilter       = THREE.LinearFilter;
    return { canvas, ctx, tex };
  }, [mobile]);

  useEffect(() => {
    return () => { boot.tex.dispose(); };
  }, [boot]);

  /* Header captures load async off the module-scope ImageLoader (see above).
     If it resolves AFTER the useFrame's drawKey change-detection has already
     latched onto a constant key (e.g. playhead parked mid-phase-2 with no new
     scroll), the header would stay undrawn until the next key change. Force
     one redraw once the image is actually available. */
  useEffect(() => {
    let cancelled = false;
    bgImagesPromise?.then(() => {
      if (cancelled) return;
      lastBootProgressRef.current = -1;
      invalidate();
    });
    return () => { cancelled = true; };
  }, [invalidate]);

  useGSAP(() => {
    if (!globalContainerRef.current || !lidHingeGroupRef.current) return;

    const mobileFrameZ = () => {
      const aspect =
        sizeRef.current.width / Math.max(1, sizeRef.current.height);
      return mobile ? Math.max(6.5, 5 / aspect) : 6.5;
    };
    const entryX = mobile ? 0 : 1.7;
    /* High enough that the phone peeks under the copy at rest. The
       settled pose stays at -0.8, and the device still parks fully
       offscreen after the projects handoff. */
    const entryY = mobile ? -3.45 : 0;
    const parkedY = mobile ? -6.8 : 0;
    globalContainerRef.current.position.set(entryX, entryY, 0);
    camera.position.z = mobileFrameZ();
    lidHingeGroupRef.current.rotation.x = 1.7285;

    /* Hero scrub timeline, keyed to #hero scroll progress 0→1:
         0     – 0.267  entry — the device rotates/slides into frame
         0.27  – 0.62   boot — spinner, then header bitmap fades in on the
                         virtual screen (see drawBootScreen phases)
         0.62  – 0.9667 dolly — zoom to the device, framed to the viewport
         0.9667– 1.0    matched window — the live Projects header aligns with
                         the phone preview, then expands into the page. */
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: "#hero",
        start: "top top",
        end: "bottom top",
        // Lenis is the single smoothing layer; a numeric scrub double-smooths

        // only the pre-swap side and breaks the velocity match under fast
        // scroll during the matched window above.
        scrub: true,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          bootProgressRef.current = self.progress;
          // Short grace so a frame is guaranteed right after the last update;
          // the real settle window is the scrub tween's isActive() (see useFrame).
          scrollSettleRef.current = performance.now();
          invalidate();
        },
      },
    });
    // Capture the ScrollTrigger so the boot useFrame can keep the demand loop
    // alive for the full duration of the scrub catch-up ease.
    scrollTriggerRef.current = tl.scrollTrigger ?? null;

    tl.fromTo(
      lidHingeGroupRef.current.rotation,
      { x: 1.7285 },
      { x: 0, duration: 0.267, ease: "power2.inOut" },
      0
    );
    tl.fromTo(
      globalContainerRef.current.position,
      { x: entryX },
      { x: 0, duration: 0.267, ease: "power2.inOut" },
      0
    );
    tl.fromTo(
      globalContainerRef.current.position,
      { y: entryY },
      { y: mobile ? -0.8 : 0, duration: 0.267, ease: "power2.inOut" },
      0
    );
    tl.fromTo(
      globalContainerRef.current.rotation,
      mobile
        ? { x: 0.05, y: -0.16, z: 0.02 }
        : { x: 0.18, y: -0.35, z: 0.05 },
      {
        x: mobile ? 0 : 0.1577,
        y: 0,
        z: 0,
        duration: 0.267,
        ease: "power2.inOut",
      },
      0
    );
    const FACE_CY      = 0.6879;
    const FACE_FRONT_Z = mobile ? -0.8509 : -0.8689;
    const FACE_HALF_W  = mobile ? 0.6 : 1.4766;
    const FACE_HALF_H  = mobile ? 1.3 : 0.9485;
    const finalDeviceTilt = mobile ? 0 : 0.1577;
    const mobileScreenY =
      (mobile ? -0.8 : 0) +
      FACE_CY * Math.cos(finalDeviceTilt) -
      FACE_FRONT_Z * Math.sin(finalDeviceTilt);
    const coverZ = () => {
      const t      = Math.tan(THREE.MathUtils.degToRad(45 / 2));
      const aspect = sizeRef.current.width / Math.max(1, sizeRef.current.height);
      const heightDistance = FACE_HALF_H / t;
      const widthDistance = FACE_HALF_W / (aspect * t);
      const d = mobile
        ? Math.max(heightDistance, widthDistance) / 0.9
        : Math.min(heightDistance, widthDistance) * COVER_OVERSHOOT;
      return FACE_FRONT_Z + d;
    };
    /* World-units of ONE viewport-height at the screen plane when the camera
       sits at coverZ. The desktop handoff uses this to match camera drift to
       page scroll; function-based values are re-evaluated on resize. */
    const vhWorld = () => {
      const dist = coverZ() - FACE_FRONT_Z;
      return 2 * dist * Math.tan(THREE.MathUtils.degToRad(45 / 2));
    };
    /* z: the dolly — settles fully before the matched window (zero radial flow
       at the swap). */
    tl.fromTo(
      camera.position,
      { z: mobileFrameZ },
      {
        z: coverZ,
        duration: 0.3467,
        ease: mobile ? "power2.out" : "power2.inOut",
      },
      0.62
    );
    /* y: rises on power1.in (t²) — zero velocity at onset, and its END velocity
       (2× average ≈ 0.016 world/vh at 16:9) lands within ~7% of the matched
       window's 1:1 rate (vhWorld/100 ≈ 0.015), instead of the old power2.inOut
       ending at ZERO and stepping instantly to 1:1 (the felt "catch"). The
       mid-zoom framing arc changes slightly — camera rides low longer, then
       sweeps up into the lock; intentional, reads as settling into frame.
       Revert path: merge y back into the z tween above. */
    tl.fromTo(
      camera.position,
      { y: 0 },
      {
        y: () =>
          mobile ? mobileScreenY : FACE_CY + (MATCH_WINDOW_VH / 100) * vhWorld(),
        duration: 0.3467,
        ease: "power1.in",
      },
      0.62
    );
    tl.fromTo(
      camera.rotation,
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0, duration: 0.3467, ease: "power2.inOut" },
      0.62
    );
    if (!mobile) {
      tl.fromTo(
        camera.position,
        { y: 0 },
        { y: FACE_CY, duration: 0.0333, ease: "none" },
        0.9667
      );
    }

    const layerEl     = canvasWrapperDOMRef.current?.closest<HTMLElement>(".hero-3d-layer");
    const projectsEl  = portfolioSectionRef?.current;
    if (layerEl && projectsEl && canvasWrapperDOMRef.current) {
      let mobileHeaderAligned = false;
      if (mobile) {
        const mobileHeader =
          projectsEl.querySelector<HTMLElement>(".sd-header .ed-header");
        const mobileHeading =
          mobileHeader?.querySelector<HTMLElement>(".ed-heading");
        const hero = document.querySelector<HTMLElement>("#hero");

        if (mobileHeader && mobileHeading && hero) {
          const framingCamera = camera.clone();
          framingCamera.position.set(0, mobileScreenY, coverZ());
          framingCamera.rotation.set(0, 0, 0);
          framingCamera.updateMatrixWorld(true);

          const screenRotation = new THREE.Euler(finalDeviceTilt, 0, 0);
          const screenHalfWidth = 0.5325;
          const screenHalfHeight = 1.155;
          const projectedCorners = [-screenHalfWidth, screenHalfWidth].flatMap((x) =>
            [-screenHalfHeight, screenHalfHeight].map((y) => {
              const point = new THREE.Vector3(x, FACE_CY + y, FACE_FRONT_Z)
                .applyEuler(screenRotation);
              point.y -= 0.8;
              point.project(framingCamera);
              return {
                x: ((point.x + 1) / 2) * sizeRef.current.width,
                y: ((1 - point.y) / 2) * sizeRef.current.height,
              };
            }),
          );
          const screenLeft = Math.min(...projectedCorners.map(({ x }) => x));
          const screenRight = Math.max(...projectedCorners.map(({ x }) => x));
          const screenTop = Math.min(...projectedCorners.map(({ y }) => y));
          const screenBottom = Math.max(...projectedCorners.map(({ y }) => y));
          const screenWidth = screenRight - screenLeft;
          const screenHeight = screenBottom - screenTop;
          const scaleX = screenWidth / MOBILE_CAPTURE_WIDTH;
          const scaleY = screenHeight / MOBILE_CAPTURE_HEIGHT;
          // Project the heading anchor directly; affine scaling misses the
          // perspective shift across the tilted screen.
          const headingPoint = new THREE.Vector3(
            -screenHalfWidth +
              (MOBILE_CAPTURE_HEADING_X / MOBILE_CAPTURE_WIDTH) *
                screenHalfWidth *
                2,
            FACE_CY +
              screenHalfHeight -
              (MOBILE_CAPTURE_HEADING_Y / MOBILE_CAPTURE_HEIGHT) *
                screenHalfHeight *
                2,
            FACE_FRONT_Z,
          )
            .applyEuler(screenRotation);
          headingPoint.y -= 0.8;
          headingPoint.project(framingCamera);
          const targetX = ((headingPoint.x + 1) / 2) * sizeRef.current.width;
          const targetY = ((1 - headingPoint.y) / 2) * sizeRef.current.height;

          const headerRect = mobileHeader.getBoundingClientRect();
          const headingRect = mobileHeading.getBoundingClientRect();
          const headerTransform = getComputedStyle(mobileHeader).transform;
          const headerMatrix =
            headerTransform === "none"
              ? new DOMMatrixReadOnly()
              : new DOMMatrixReadOnly(headerTransform);
          const headerDocumentTop =
            headerRect.top + window.scrollY - headerMatrix.m42;
          const headingOffsetX = headingRect.left - headerRect.left;
          const headingOffsetY = headingRect.top - headerRect.top;
          const trigger = scrollTriggerRef.current;
          const heroEndY =
            trigger && trigger.end > trigger.start
              ? trigger.end
              : hero.getBoundingClientRect().bottom + window.scrollY;
          const handoffDistance =
            (MATCH_WINDOW_VH / 100) * sizeRef.current.height;
          const headerTopAtStart =
            headerDocumentTop - heroEndY + handoffDistance;
          const projectsRect = projectsEl.getBoundingClientRect();
          const projectsDocumentTop = projectsRect.top + window.scrollY;
          const projectsHeight = projectsEl.offsetHeight;
          const clipRadius = Math.min(screenWidth, screenHeight) * 0.075;
          const scrollStart =
            trigger?.start ?? hero.getBoundingClientRect().top + window.scrollY;
          const scrollEnd =
            trigger && trigger.end > trigger.start ? trigger.end : heroEndY;
          const screenClipAt = (progress: number) => {
            const scrollY =
              scrollStart + (scrollEnd - scrollStart) * progress;
            const sectionTop = projectsDocumentTop - scrollY;
            const top = screenTop - sectionTop;
            const right = projectsRect.right - screenRight;
            const bottom =
              projectsHeight - (screenBottom - sectionTop);
            const left = screenLeft - projectsRect.left;
            return `inset(${top}px ${right}px ${bottom}px ${left}px round ${clipRadius}px)`;
          };
          const startX =
            targetX -
            (headerRect.left - headerMatrix.m41) -
            headingOffsetX * scaleX;
          const startY =
            targetY - headerTopAtStart - headingOffsetY * scaleY;

          tl.set(
            mobileHeader,
            {
              transformOrigin: "top left",
              x: startX,
              y: startY,
              scaleX,
              scaleY,
            },
            0.9667,
          );
          tl.set(projectsEl, { clipPath: screenClipAt(0.9667) }, 0.9667);
          tl.to(
            projectsEl,
            {
              clipPath: screenClipAt(0.9834),
              ease: "none",
              duration: 0.0167,
            },
            0.9667,
          );
          tl.to(
            projectsEl,
            {
              clipPath: "inset(0px)",
              ease: "none",
              duration: 0.0166,
            },
            0.9834,
          );
          tl.set(projectsEl, { clearProps: "clipPath" }, 1.0);
          tl.to(
            mobileHeader,
            {
              y: startY + handoffDistance / 2,
              ease: "none",
              duration: 0.0167,
            },
            0.9667,
          );
          tl.to(
            mobileHeader,
            {
              x: 0,
              y: 0,
              scaleX: 1,
              scaleY: 1,
              ease: "none",
              duration: 0.0166,
            },
            0.9834,
          );
          mobileHeaderAligned = true;
        }
      }

      /* Raise the screen above the incoming section, then crossfade it into
         Selected Work during the final, scroll-matched window. */
      tl.set(layerEl, { zIndex: 30 }, 0.62);
      tl.set(projectsEl, { opacity: 1, pointerEvents: "auto" }, 0.9667);
      tl.to(
        layerEl,
        {
          opacity: 0,
          ease: "none",
          duration: mobileHeaderAligned ? 0.0167 : 0.0333,
        },
        0.9667,
      );
      /* Keep the shared Canvas mounted after the handoff. The device group is
         parked below, while the same renderer remains available for the
         About → Contact burn without allocating a second context. */
    }
    if (mobile) {
      tl.to(
        globalContainerRef.current.position,
        { y: parkedY, duration: 0.0166, ease: "none" },
        0.9834,
      );
    } else {
      tl.set(globalContainerRef.current, { visible: false }, 1.0);
    }

    onReady();

  }, {
    /* revertOnUpdate kills the previous timelines/ScrollTriggers before any
       re-run — @gsap/react's default (revert on unmount only) leaks them in
       this never-unmounting component. */
    dependencies: [camera, canvasWrapperDOMRef, portfolioSectionRef, invalidate, mobile, onReady],
    revertOnUpdate: true,
  });

  /* ── Boot-screen rendering ──────────────────────────────────────────
     With frameloop="demand" this only runs when a frame was requested.
     Self-perpetuates (via invalidate) in two cases where time drives the
     animation rather than scroll:
       1. inDots — spinner reads state.clock.elapsedTime every frame
       2. scrub tail — GSAP scrub:0.6 eases for ~600ms after last scroll
     Outside those windows it's a no-op and no new frame is scheduled.  ── */
  useFrame((state) => {
    const progress = bootProgressRef.current;
    const inDots   = !prefersReduced && progress >= BOOT_P1 && progress < BOOT_P2;

    // Change-detection key: the flat-dark phase (< BOOT_P1) renders identically
    // regardless of exact progress, so collapse it to a single value. Otherwise
    // we'd redraw + re-upload the 1536×987 CanvasTexture (~6 MB texImage2D) every
    // frame across the first 40% of the hero for ZERO visual change — the main
    // cause of the iGPU scroll stutter. (Dots + fade genuinely change per frame.)
    // Quantize the change-detection key per phase so the 1536×987 texture
    // only re-uploads when pixels actually change:
    //   < P1        — flat dark, one key (0): zero redraws
    //   P1–P2 dots  — raw progress (inDots forces per-frame redraws anyway)
    //   P2–P3 fade  — 24 discrete alpha buckets: ≤24 uploads for the whole fade
    //   ≥ P3        — header fully faded in, one key: ZERO redraws during the
    //                 entire camera zoom (0.62→0.98), the window that must
    //                 stay butter-smooth.
    const drawKey =
      progress < BOOT_P1 ? 0
      : progress < BOOT_P2 ? progress
      : progress < BOOT_P3 ? 1 + Math.round(((progress - BOOT_P2) / (BOOT_P3 - BOOT_P2)) * 24)
      : 1000;

    if (drawKey !== lastBootProgressRef.current || inDots) {
      lastBootProgressRef.current = drawKey;
      drawBootScreen(
        boot.ctx,
        progress,
        state.clock.elapsedTime,
        mobile ? bgMobileImage ?? bgImage : bgImage,
        prefersReduced,
        mobile,
      );
      boot.tex.needsUpdate = true;
    }

    // Keep scheduling frames while a time- or scrub-driven animation is still
    // running. The scrub demand window is tied to the scrub tween's actual
    // activity (not a fixed timeout, which under-shoots the ease tail and stalls
    // the device entry just short of complete); a small grace covers update jitter.
    const scrubTween = scrollTriggerRef.current?.getTween?.();
    const inScrubTail =
      (scrubTween ? scrubTween.isActive() : false) ||
      performance.now() - scrollSettleRef.current < 120;
    if (inDots || inScrubTail) {
      invalidate();
    }
  });

  /* ── Pointer parallax ──────────────────────────────────────────────
     Attaches a pointermove listener on the canvas wrapper DOM element and
     calls invalidate() so demand mode fires a frame on each move. The
     actual lerp still happens in useFrame (which runs because invalidate
     was just called). On lowPerf / reduced-motion the listener is never
     attached, saving per-event work entirely. ── */
  useFrame(() => {
    const g = parallaxGroupRef.current;
    if (!g || prefersReduced || lowPerf || parallaxScale <= 0) return;
    const fade = 1 - Math.max(0, Math.min(1, (bootProgressRef.current - 0.37) / 0.13));
    // Lerp the UNFADED pointer target in a persistent accumulator, then apply
    // fade to the resulting rotation. Fading the applied value (not the target)
    // forces the tilt to exactly 0 the instant fade hits 0 at bootProgress 0.37
    // — so the cover shot lands dead-center regardless of where the mouse was,
    // instead of a residual lerp still decaying into the framing.
    const targetX = pointerRef.current.y * 0.055 * parallaxScale;
    const targetY = pointerRef.current.x * 0.09 * parallaxScale;
    const c = parallaxCur.current;
    const dx = targetX - c.x;
    const dy = targetY - c.y;
    c.x += dx * 0.14;
    c.y += dy * 0.14;
    g.rotation.x = c.x * fade;
    g.rotation.y = c.y * fade;
    // Self-perpetuate the demand loop until the lerp has settled, so the
    // parallax finishes easing after the pointer stops instead of freezing
    // mid-glide (frameloop="demand" renders no frame unless we ask for one).
    if (Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4) invalidate();
  });

  useEffect(() => {
    if (prefersReduced || lowPerf || parallaxScale <= 0) return;
    // Canvas + wrapper are pointer-events:none (see InteractiveModel), so the
    // listener lives on window instead of the wrapper DOM element.
    // Invalidate on every move (no throttle): the parallax useFrame self-limits
    // its work and self-perpetuates its own settle, and the hero's real cost is
    // the boot-texture upload, not pointermove. Throttling here starved the lerp
    // between ticks and left the tilt feeling choppy/stuck. Parallax is
    // gated off on the lowPerf/iGPU path anyway, so this only runs on dGPU.
    const onMove = (e: PointerEvent) => {
      pointerRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointerRef.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
      invalidate();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [prefersReduced, lowPerf, parallaxScale, invalidate]);

  return (
    <group ref={parallaxGroupRef}>
      <group
        ref={globalContainerRef}
        position={mobile ? [0, -3.45, 0] : [1.7, 0, 0]}
        rotation={[0.18, -0.35, 0.05]}
      >
        {mobile ? (
          <group ref={lidHingeGroupRef}>
            <SmartphoneModel screenTexture={boot.tex} />
          </group>
        ) : (
          <LaptopModel screenTexture={boot.tex} hingeRef={lidHingeGroupRef} />
        )}
      </group>
    </group>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   WEBGL FALLBACK
   ───────────────────────────────────────────────────────────────── */
class WebGLBoundary extends Component<
  { children: ReactNode; onFail?: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    // Boundary renders null on failure, which would otherwise strand the
    // GSAP reveal timeline that lives inside the Canvas subtree — nothing
    // left to ever flip #projects visible. Reveal it directly via DOM.
    this.props.onFail?.();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export interface InteractiveModelProps {
  portfolioSectionRef?: React.RefObject<HTMLElement | null>;
  renderDevice?: boolean;
  mobile?: boolean;
  onFail?: () => void;
}

function StageLights({
  degraded,
  environmentResolution,
}: {
  degraded: boolean;
  environmentResolution: 32 | 64;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const [lightTheme, setLightTheme] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setLightTheme(root.dataset.theme === "light");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    invalidate();
  }, [degraded, invalidate, lightTheme]);

  if (lightTheme) {
    return (
      <>
        <ambientLight intensity={degraded ? 1.15 : 0.72} />
        <hemisphereLight args={["#fffaf3", "#d9cbb6", degraded ? 0.55 : 0.85]} />
        <directionalLight position={[6, 11, 7]} intensity={2.15} color="#fff8ef" />
        <directionalLight position={[-7, 4, -3]} intensity={0.48} color="#8eafd0" />
        {!degraded && (
          <Environment resolution={environmentResolution} background={false}>
            <Lightformer intensity={1.15} position={[3, 4, 4]} scale={[6, 5, 1]} color="#fffaf4" />
            <Lightformer intensity={0.35} position={[-4, 2, -2]} scale={[4, 4, 1]} color="#b7c8dc" />
            <Lightformer form="ring" intensity={0.22} position={[0, 5, 2]} scale={[3, 3, 1]} color="#ffffff" />
          </Environment>
        )}
      </>
    );
  }

  return (
    <>
      <ambientLight intensity={degraded ? 1.05 : 0.42} />
      <hemisphereLight args={["#f4ecdf", "#120e0b", 0.38]} />
      <directionalLight position={[7, 12, 6]} intensity={2.45} color="#fff3df" />
      <directionalLight position={[-8, 5, -5]} intensity={0.62} color="#8eabcf" />
      <pointLight position={[2.4, 1.4, 3.4]} intensity={degraded ? 0 : 1.15} color="#e4c56a" distance={12} decay={2} />
      {!degraded && (
        <Environment resolution={environmentResolution} background={false}>
          <Lightformer intensity={0.95} position={[3, 3.4, 4]} scale={[6, 5, 1]} color="#f4efe6" />
          <Lightformer intensity={0.42} position={[-4, 2, -3]} scale={[5, 4, 1]} color="#8eabcf" />
          <Lightformer form="ring" intensity={0.28} position={[0, 5, 2]} scale={[3, 3, 1]} color="#fff6e4" />
        </Environment>
      )}
    </>
  );
}

export default function InteractiveModel({
  portfolioSectionRef,
  renderDevice = true,
  mobile = false,
  onFail,
}: InteractiveModelProps) {
  const canvasWrapperDOMRef = useRef<HTMLDivElement>(null);
  const [quality] = useState(() => resolveAdaptiveQuality());
  const [dpr, setDpr] = useState(quality.dpr);
  const [degraded, setDegraded] = useState(
    () => quality.shaderDetailScale < 0.7,
  );
  const degradedRef = useRef(degraded);
  useEffect(() => {
    degradedRef.current = degraded;
  }, [degraded]);

  // GL context creation signal + fallback-reveal guards. The scrub timeline
  // that normally reveals #projects lives inside <Canvas>; if WebGL throws
  // (WebGLBoundary) or context creation just never resolves, that timeline
  // never exists and everything below the hero stays permanently hidden.
  const createdRef = useRef(false);
  const revealedRef = useRef(false);
  const contextCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextLostRef = useRef<((event: Event) => void) | null>(null);

  const sceneReadyRef = useRef(false);
  const revealFallback = useCallback(() => {
    if (revealedRef.current) return; // idempotent — boundary + timeout can both fire
    revealedRef.current = true;
    loaderControls.fail();
    const layerEl = canvasWrapperDOMRef.current?.closest(".hero-3d-layer") as HTMLElement | null;
    if (layerEl) layerEl.style.opacity = "0";
    const projectsEl = portfolioSectionRef?.current;
    if (projectsEl) {
      projectsEl.style.opacity = "1";
      projectsEl.style.pointerEvents = "auto";
    }
    onFail?.();
  }, [onFail, portfolioSectionRef]);

  const markSceneReady = useCallback(() => {
    sceneReadyRef.current = true;
  }, []);

  useEffect(() => {
    // Cover the case where the context never fires onCreated at all (no
    // thrown error for WebGLBoundary to catch, just a silent stall).
    const timeoutId = window.setTimeout(() => {
      if (
        !createdRef.current ||
        (renderDevice && !sceneReadyRef.current)
      ) {
        revealFallback();
      }
    }, 10000);
    return () => window.clearTimeout(timeoutId);
  }, [renderDevice, revealFallback]);

  useEffect(() => () => {
    const canvas = contextCanvasRef.current;
    const handler = contextLostRef.current;
    if (canvas && handler) canvas.removeEventListener("webglcontextlost", handler);
    contextCanvasRef.current = null;
    contextLostRef.current = null;
  }, []);

  return (
    <div
      ref={canvasWrapperDOMRef}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      <WebGLBoundary onFail={revealFallback}>
      <Canvas
        camera={{ position: [0, 0, 6.5], fov: 45 }}
        frameloop="demand"
        dpr={dpr}
        gl={{
          antialias: quality.antialias,
          alpha: true,
          powerPreference: "high-performance",
        }}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          pointerEvents: "none",
        }}
        onCreated={({ gl }) => {
          createdRef.current = true;
          gl.setClearAlpha(0);
          if (!renderDevice) sceneReadyRef.current = true;
          loaderControls.markStageReady();
          const previousCanvas = contextCanvasRef.current;
          const previousHandler = contextLostRef.current;
          if (previousCanvas && previousHandler) {
            previousCanvas.removeEventListener("webglcontextlost", previousHandler);
          }
          const canvas = gl.domElement;
          const handleContextLoss = (event: Event) => {
            event.preventDefault();
            revealFallback();
          };
          canvas.addEventListener("webglcontextlost", handleContextLoss, false);
          contextCanvasRef.current = canvas;
          contextLostRef.current = handleContextLoss;
        }}
      >
        {renderDevice && (
          <PerformanceMonitor
            flipflops={3}
            onIncline={() => {
              if (!degradedRef.current) setDpr(cappedDpr());
            }}
            onDecline={() => {
              setDpr(Math.max(0.75, cappedDpr() * 0.78));
              setDegraded(true);
            }}
          />
        )}

        {/* temporary OOM-investigation probe — inert without ?memprobe */}
        <GlProbe name="visual-stage" />

        {/* FrameloopGate removed: frameloop="demand" already renders zero
            frames when nobody calls invalidate(). When hero is offscreen the
            ScrollTrigger stops firing onUpdate → no invalidate → no frames. */}

        {renderDevice && (
          <StageLights
            degraded={degraded}
            environmentResolution={quality.environmentResolution}
          />
        )}

        {renderDevice && (
          <Suspense fallback={null}>
            <DeviceScene
              canvasWrapperDOMRef={canvasWrapperDOMRef}
              portfolioSectionRef={portfolioSectionRef}
              mobile={mobile}
              lowPerf={degraded}
              parallaxScale={degraded ? 0 : quality.parallaxScale}
              onReady={markSceneReady}
            />
          </Suspense>
        )}
        <ObsidianPlane />
        <BurnPlane />
      </Canvas>
      </WebGLBoundary>
    </div>
  );
}
