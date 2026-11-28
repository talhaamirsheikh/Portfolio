"use client";

import React, { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

interface TerminalHighlightProps {
  children: React.ReactNode;
  color?: string;
  delay?: number;
  animate?: boolean;
}

export function TerminalHighlight({
  children,
  color = "var(--accent)",
  delay = 0,
  animate = true,
}: TerminalHighlightProps) {
  const containerRef = useRef<HTMLSpanElement>(null);

  useGSAP(() => {
    const highlight = containerRef.current;
    if (!highlight) return;

    if (!animate) {
      gsap.set(highlight, { backgroundSize: "100% 100%" });
      highlight.dataset.highlighted = "true";
      return;
    }

    const mm = gsap.matchMedia();
    const finishHighlight = () => {
      highlight.dataset.highlighted = "true";
      highlight.style.removeProperty("color");
    };

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      /* A cloned inline background gives every wrapped line its own gold
         plate, so the long statement can wrap without crossing the laptop. */
      const tl = gsap.timeline({ delay });
      tl.fromTo(
        highlight,
        { backgroundSize: "0% 100%", color: "inherit" },
        { backgroundSize: "100% 100%", ease: "power4.inOut", duration: 0.5 }
      ).to(
        highlight,
        {
          color: getComputedStyle(document.documentElement)
            .getPropertyValue("--accent-contrast")
            .trim(),
          duration: 0.15,
          onComplete: finishHighlight,
        },
        "-=0.25"
      );
    });

    mm.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(highlight, { backgroundSize: "100% 100%" });
      finishHighlight();
    });

    return () => mm.revert();
  }, { scope: containerRef, dependencies: [animate, delay] });

  return (
    <span
      ref={containerRef}
      className="terminal-highlight"
      style={{ "--terminal-highlight-color": color } as React.CSSProperties}
    >
      {children}
    </span>
  );
}
