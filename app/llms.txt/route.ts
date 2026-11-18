import { PROJECTS, BUILDING } from "@/lib/data";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://talhaamirsheikh.github.io";

// First sentence of a description field, used as a tight one-line gist.
function firstSentence(text: string): string {
  const match = text.match(/^.+?[.!?](?=\s|$)/);
  return (match ? match[0] : text).trim();
}

// Loose normalization for "is this sentence basically just the subtitle
// again?" comparisons — ignores case, punctuation, and "&" vs "and".
function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type ProjectLink = { label: string; href: string; demo?: boolean };

function buildProjectsSection(): string {
  return PROJECTS.map((project) => {
    const links: readonly ProjectLink[] = "links" in project ? project.links : [];
    const primaryHref = links.find((link) => link.label === "View Source")?.href ?? project.github;
    const demoLink = links.find((link) => link.demo === true);

    // SynthRescue's description opens by restating its subtitle almost
    // verbatim (just different casing), so fall back to the second sentence
    // for a non-redundant gist.
    const sentences = project.description.split(/(?<=[.!?])\s+/).filter(Boolean);
    const leadSentence = firstSentence(project.description);
    const restatesSubtitle =
      normalizeForComparison(leadSentence) === normalizeForComparison(project.subtitle);
    const gist =
      sentences.length > 1 && restatesSubtitle
        ? firstSentence(sentences.slice(1).join(" "))
        : leadSentence;

    let line = `- [${project.title}](${primaryHref}): ${project.subtitle} — ${project.metric}. ${gist}`;
    if (demoLink) {
      line += ` Demo: ${demoLink.href}`;
    }
    return line;
  }).join("\n");
}

function buildBuildingSection(): string {
  return BUILDING.map(
    (item) => `- [${item.status}] ${item.title}: ${firstSentence(item.description)}`
  ).join("\n");
}

function buildBody(): string {
  return `# Talha Sheikh

> AI Engineer and MERN Stack Developer with 2 years of MERN experience and 4 years of WordPress development experience. BSCS student in the 7th semester at The Superior University Lahore, expected to graduate in 2027. Open to work.

## Projects
${buildProjectsSection()}

## Currently building
${buildBuildingSection()}

## Links
- Site: ${SITE_URL}
- Email: talhaamir.sh@gmail.com
- Phone: +92 329 7534322
- Location: Lahore, Pakistan
- GitHub: https://github.com/talhaamirsheikh
- LinkedIn: https://www.linkedin.com/in/talha-amir-sheikh/
`;
}

export const dynamic = "force-static";

export function GET() {
  return new Response(buildBody(), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
