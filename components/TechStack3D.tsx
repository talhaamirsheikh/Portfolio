"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

export interface TechCardData {
  id: string;
  num: string;
  eyebrow: string;
  title: string;
  text: string;
  foot: string;
  icon: "brain" | "shield" | "laptop" | "cube" | "globe" | "tag";
}

const TECH_CARDS: TechCardData[] = [
  {
    id: "ai-ml",
    num: "01",
    eyebrow: "Artificial Intelligence",
    title: "AI & Machine Learning",
    text: "Designing intelligent neural architectures with PyTorch, Mixture-of-Experts (MoE), and Deep Learning. Experienced in training, AST screening, and validation.",
    foot: "PyTorch · MoE · Deep Learning",
    icon: "brain",
  },
  {
    id: "agentic-ai",
    num: "02",
    eyebrow: "Agentic Systems",
    title: "Autonomous Agents & LLMs",
    text: "Building autonomous multi-agent pipelines, RAG systems, and integrating Gemini, Gemma, and OpenAI models for real-world automated workflows.",
    foot: "Multi-Agent · RAG · LLMOps",
    icon: "shield",
  },
  {
    id: "frontend",
    num: "03",
    eyebrow: "Frontend Architecture",
    title: "React & Next.js Ecosystem",
    text: "Crafting high-performance, fluid user experiences using React.js, Next.js, TypeScript, Tailwind CSS, GSAP animations, and interactive 3D WebGL.",
    foot: "React.js · Next.js · TypeScript",
    icon: "laptop",
  },
  {
    id: "backend",
    num: "04",
    eyebrow: "Backend & Systems",
    title: "Node.js & MERN Stack",
    text: "2 years of production MERN experience engineering robust REST APIs, Express.js microservices, MongoDB schemas, and real-time event webhooks.",
    foot: "Node.js · Express · MongoDB",
    icon: "cube",
  },
  {
    id: "cms",
    num: "05",
    eyebrow: "CMS & E-Commerce",
    title: "WordPress & WooCommerce",
    text: "4 years of specialized WordPress development, bespoke WooCommerce architectures, Elementor Pro design systems, custom PHP plugins, and speed optimization.",
    foot: "WordPress · WooCommerce · PHP",
    icon: "globe",
  },
  {
    id: "devops",
    num: "06",
    eyebrow: "Cloud & Tools",
    title: "Cloud, Git & Analytics",
    text: "Deploying containerized services with Docker and Google Cloud Platform, managing Git/GitHub CI/CD pipelines, and driving data-informed decisions.",
    foot: "Docker · GCP · Git · Analytics",
    icon: "tag",
  },
];

function TechIcon({ type }: { type: TechCardData["icon"] }) {
  switch (type) {
    case "brain":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04z" />
          <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04z" />
        </svg>
      );
    case "shield":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6l8-3z" />
          <path d="M8.5 12l2.5 2.5 4.5-5" />
        </svg>
      );
    case "laptop":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="5" width="16" height="11" rx="1.5" />
          <path d="M2.5 19.5h19" />
          <path d="M10 9l-2 2 2 2M14 9l2 2-2 2" />
        </svg>
      );
    case "cube":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
          <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
        </svg>
      );
    case "globe":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c3.2 3.2 3.2 14.8 0 18M12 3c-3.2 3.2-3.2 14.8 0 18" />
        </svg>
      );
    case "tag":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 12V4h8l10 10-8 8L3 12z" />
          <circle cx="7.5" cy="8.5" r="1.5" />
        </svg>
      );
  }
}

const CW = 417;
const P = 1400;
const HW = CW / 2;
const RS = [0.912, 0.847, 0.776, 0.704];
const RA = [10, 12.5, 14.5, 17];
const FS = 0.95;
const FA = 14;

const CFG = {
  wide: {
    cls: "dpx-wide",
    dw: 1900,
    dh: 660,
    act: 235,
    fl: 32,
    right: [958, 1254, 1551, 1847],
  },
  compact: {
    cls: "dpx-compact",
    dw: 650,
    dh: 665,
    act: 44,
    fl: 4,
    right: [571, 606, 640, 640],
  },
};

const rad = (deg: number) => (deg * Math.PI) / 180;

interface CardTransformState {
  cx: number;
  s: number;
  a: number;
  op: number;
  z: number;
  blur: number;
}

function calculateCardState(
  d: number,
  cfg: typeof CFG.wide | typeof CFG.compact,
): CardTransformState {
  if (d === 0) {
    return { cx: cfg.act + HW, s: 1, a: 0, op: 1, z: 30, blur: 0 };
  }
  if (d === -1) {
    const h = HW * FS;
    const a = h * Math.sin(rad(FA));
    return {
      cx: cfg.fl + (h * Math.cos(rad(FA)) * P) / (P - a),
      s: FS,
      a: FA,
      op: 0.5,
      z: 5,
      blur: 1.6,
    };
  }
  const k = Math.min(Math.max(d - 1, 0), RS.length - 1);
  const s = RS[k];
  const t = RA[k];
  const hh = HW * s;
  const aa = hh * Math.sin(rad(t));
  return {
    cx: cfg.right[k] - (hh * Math.cos(rad(t)) * P) / (P - aa),
    s: s,
    a: -t,
    op: cfg === CFG.compact && d >= 4 ? 0 : 1,
    z: 20 - d,
    blur: 0,
  };
}

export default function TechStack3D() {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const designRef = useRef<HTMLDivElement>(null);

  const [active, setActive] = useState(0);
  const [isCompact, setIsCompact] = useState(false);
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(780);
  const [noTransition, setNoTransition] = useState(false);

  const prevDRef = useRef<(number | null)[]>(TECH_CARDS.map(() => null));
  const pointerStartRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  const n = TECH_CARDS.length;
  const cfg = isCompact ? CFG.compact : CFG.wide;

  const updateLayout = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    const availableWidth = root.clientWidth || window.innerWidth;
    const compactMode = availableWidth < 1060;
    const activeCfg = compactMode ? CFG.compact : CFG.wide;

    /* Window height adaptive headroom so controls and reflection never overflow */
    const windowH = typeof window !== "undefined" ? window.innerHeight : 900;
    const reservedTopBottom = compactMode ? 175 : 220;
    const maxAvailableH = Math.max(280, windowH - reservedTopBottom);

    /* Scale to fit available width and height */
    const scW = availableWidth / activeCfg.dw;
    const scH = maxAvailableH / activeCfg.dh;
    const sc = Math.min(1, scW, scH);
    const left = Math.max(0, (availableWidth - activeCfg.dw * sc) / 2);
    const vh = Math.round(activeCfg.dh * sc);

    setIsCompact(compactMode);
    setScale(sc);
    setOffsetX(left);
    setViewportHeight(vh);
  }, []);

  useEffect(() => {
    updateLayout();

    const root = rootRef.current;
    if (!root) return;

    let resizeTimer: number;
    const handleResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        setNoTransition(true);
        updateLayout();
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setNoTransition(false));
        });
      }, 50);
    };

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(handleResize)
        : null;
    ro?.observe(root);
    window.addEventListener("resize", handleResize, { passive: true });

    return () => {
      window.clearTimeout(resizeTimer);
      ro?.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [updateLayout]);

  const goTo = useCallback(
    (dir: number) => {
      setActive((prev) => (prev + dir + n) % n);
    },
    [n],
  );

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      goTo(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      goTo(-1);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerStartRef.current = e.clientX;
    isDraggingRef.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (pointerStartRef.current !== null) {
      if (Math.abs(e.clientX - pointerStartRef.current) > 8) {
        isDraggingRef.current = true;
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (pointerStartRef.current === null) return;
    const dx = e.clientX - pointerStartRef.current;
    pointerStartRef.current = null;
    if (Math.abs(dx) > 40) {
      goTo(dx < 0 ? 1 : -1);
    }
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 0);
  };

  const handlePointerCancel = () => {
    pointerStartRef.current = null;
    isDraggingRef.current = false;
  };

  const currentCard = TECH_CARDS[active];
  const progressPercent = ((active + 1) / n) * 100;

  return (
    <div
      ref={rootRef}
      className={`dpx-root ${isCompact ? "dpx-compact" : "dpx-wide"} ${
        noTransition ? "dpx-notrans" : ""
      }`}
      id="dpx-carousel"
      tabIndex={0}
      role="region"
      aria-roledescription="carousel"
      aria-label="Core Technology Stack"
      onKeyDown={handleKeyDown}
    >
      <div
        ref={viewportRef}
        className="dpx-viewport"
        style={{ height: `${viewportHeight}px` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div
          ref={designRef}
          className="dpx-design"
          style={{
            width: `${cfg.dw}px`,
            height: `${cfg.dh}px`,
            transform: `scale(${scale})`,
            left: `${offsetX}px`,
          }}
        >
          {/* Card Slots */}
          <div className="dpx-slots">
            {TECH_CARDS.map((card, i) => {
              const d = ((i - active + n + 1) % n) - 1;
              const st = calculateCardState(d, cfg);
              const isActive = d === 0;

              const prevD = prevDRef.current[i];
              const wrapped = prevD !== null && Math.abs(d - prevD) > 3;
              prevDRef.current[i] = d;

              const transformStr = `translate3d(${(st.cx - HW).toFixed(
                1,
              )}px, 0, 0) perspective(${P}px) rotateY(${st.a}deg) scale(${
                st.s
              })`;

              return (
                <div
                  key={card.id}
                  className={`dpx-slot ${isActive ? "dpx-active" : ""}`}
                  style={{
                    transform: transformStr,
                    zIndex: st.z,
                    opacity: st.op,
                    filter: st.blur ? `blur(${st.blur}px)` : "none",
                    pointerEvents: st.op ? "auto" : "none",
                    transition:
                      wrapped || noTransition
                        ? "none"
                        : "transform 0.8s cubic-bezier(0.45, 0.05, 0.2, 1), opacity 0.6s ease, filter 0.6s ease",
                  }}
                  onClick={() => {
                    if (isDraggingRef.current) return;
                    if (i !== active) setActive(i);
                  }}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${card.num}: ${card.title}`}
                  aria-hidden={!isActive}
                >
                  {/* Card Front */}
                  <div className="dpx-card">
                    <div className="dpx-num mono">{card.num}</div>
                    <div className="dpx-icon" aria-hidden="true">
                      <TechIcon type={card.icon} />
                    </div>
                    <div className="dpx-body">
                      <div className="dpx-eyebrow mono">
                        {card.num} — {card.eyebrow}
                      </div>
                      <h3 className="dpx-title">{card.title}</h3>
                      <p className="dpx-text">{card.text}</p>
                    </div>
                    <div className="dpx-foot">
                      <span className="dpx-foot-text mono">{card.foot}</span>
                      <span className="dpx-go" aria-hidden="true">
                        <svg viewBox="0 0 24 24">
                          <path d="M4 12h16M14 6l6 6-6 6" />
                        </svg>
                      </span>
                    </div>
                  </div>

                  {/* Reflection */}
                  <div className="dpx-refl" aria-hidden="true">
                    <div className="dpx-card">
                      <div className="dpx-num mono">{card.num}</div>
                      <div className="dpx-icon">
                        <TechIcon type={card.icon} />
                      </div>
                      <div className="dpx-body">
                        <div className="dpx-eyebrow mono">
                          {card.num} — {card.eyebrow}
                        </div>
                        <div className="dpx-title">{card.title}</div>
                        <div className="dpx-text">{card.text}</div>
                      </div>
                      <div className="dpx-foot">
                        <span className="dpx-foot-text mono">{card.foot}</span>
                        <span className="dpx-go">
                          <svg viewBox="0 0 24 24">
                            <path d="M4 12h16M14 6l6 6-6 6" />
                          </svg>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Navigation Controls */}
          <div className="dpx-controls">
            <button
              className="dpx-btn dpx-prev"
              type="button"
              aria-label="Previous skill"
              title="Previous skill"
              onClick={() => goTo(-1)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 12H4M10 6l-6 6 6 6" />
              </svg>
            </button>

            <div className="dpx-info">
              <div className="dpx-info-top">
                <span className="dpx-cur mono">{currentCard.num}</span>
                <span className="dpx-ttl">{currentCard.title}</span>
                <span className="dpx-tot mono">/ 0{n}</span>
              </div>
              <div
                className="dpx-bar"
                role="progressbar"
                aria-valuenow={active + 1}
                aria-valuemin={1}
                aria-valuemax={n}
                aria-label="Skill stack progress"
              >
                <span
                  className="dpx-bar-fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <button
              className="dpx-btn dpx-next"
              type="button"
              aria-label="Next skill"
              title="Next skill"
              onClick={() => goTo(1)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 12h16M14 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
