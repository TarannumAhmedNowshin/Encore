import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader, SiteFooter } from "@/components/encore/SiteHeader";
import { LandingStory } from "@/components/encore/landing/Story";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Encore — Your last win already knows who to sell to next" },
      { name: "description", content: "You already won one customer. Encore finds other companies with the same problem, shows you the public proof, and writes the first email for you. You decide what gets sent." },
      { property: "og:title", content: "Encore — your last win already knows who to sell to next" },
      { property: "og:description", content: "You already won one customer. Encore finds other companies with the same problem, shows you the public proof, and writes the first email for you. You decide what gets sent." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen">
      <SiteHeader transparent />
      <main><LandingStory /></main>
      <SiteFooter />
    </div>
  );
}
