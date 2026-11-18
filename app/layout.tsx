import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { preload } from "react-dom";
import { Plus_Jakarta_Sans, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import SmoothScroll from "../components/SmoothScroll";
import CursorReticle from "../components/CursorReticle";
import MemProbe from "../components/MemProbe";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import "./evolution.css";

// Absolute-URL base for canonical links, OG/Twitter images, and the sitemap.
// Env var wins on Vercel previews; falls back to the production domain.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://talhaamirsheikh.github.io";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
  // 300 was loaded but never referenced anywhere in globals.css or TSX
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains",
  weight: ["400", "500", "600"],
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-instrument",
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  title: "Talha Sheikh: AI Engineer & MERN Stack Developer",
  description:
    "Talha Sheikh's portfolio: AI Engineering, AI-powered applications, MERN Stack development, and WordPress development.",
  keywords: [
    "Talha Sheikh",
    "AI Engineer",
    "MERN Stack Developer",
    "Full Stack Developer",
    "React.js Developer",
    "Artificial Intelligence",
    "Generative AI",
    "WordPress Developer",
  ],
  openGraph: {
    title: "Talha Sheikh: AI Engineer & MERN Stack Developer",
    description:
      "Talha Sheikh's portfolio: AI Engineering, MERN Stack development, and WordPress development.",
    type: "website",
    url: "/",
    siteName: "Talha Sheikh",
    // og:image is injected automatically by app/opengraph-image.jpeg
  },
  twitter: {
    card: "summary_large_image",
    title: "Talha Sheikh: AI Engineer & MERN Stack Developer",
    description:
      "AI Engineering and MERN Stack development by Talha Sheikh.",
    // twitter:image is injected automatically by app/twitter-image.jpeg
  },
};

export const viewport: Viewport = {
  themeColor: "#0D0B09",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Kick off hero-critical asset fetches from the initial HTML instead of
  // waiting for client JS to evaluate useGLTF.preload — parallel with the
  // JS download, shortens the preloader's wall time on cold loads.
  preload("/assets/hardware_laptop.glb", { as: "fetch", crossOrigin: "anonymous" });
  // crossOrigin must match THREE's loaders (anonymous) or the preloaded
  // response has a different credentials mode and both textures download twice.
  preload("/assets/textures/bg.jpg", { as: "image", crossOrigin: "anonymous" });
  preload("/assets/textures/Mac Keyboard.jpg", {
    as: "image",
    crossOrigin: "anonymous",
  });

  return (
    <html
      lang="en"
      className={`${plusJakartaSans.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable}`}
    >
      <body suppressHydrationWarning>
        <Script id="scroll-restoration" strategy="beforeInteractive">
          {`history.scrollRestoration = "manual";
if (!location.hash) window.scrollTo(0, 0);`}
        </Script>
        {/* Film-grain noise overlay — fixed, pointer-events-none, adds physical texture */}
        <div className="grain-overlay" aria-hidden="true" />
        {/* Person structured data for name-search rich results */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Person",
              name: "Talha Sheikh",
              url: SITE_URL,
              jobTitle: "AI Engineer & MERN Stack Developer",
              alumniOf: {
                "@type": "CollegeOrUniversity",
                name: "The Superior University Lahore",
              },
              sameAs: [
                "https://github.com/talhaamirsheikh",
                "https://www.linkedin.com/in/talha-amir-sheikh/",
              ],
            }),
          }}
        />
        <SmoothScroll>{children}</SmoothScroll>
        {/* Detection-reticle cursor — body-level sibling so position:fixed is
            never trapped inside a transformed ancestor. Renders null on
            touch / reduced-motion. */}
        <CursorReticle />
        {/* Temporary OOM-investigation HUD — renders nothing without ?memprobe */}
        <MemProbe />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
