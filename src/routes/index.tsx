import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader, SiteFooter } from "@/components/encore/SiteHeader";
import { LandingStory } from "@/components/encore/landing/Story";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Encore — Your last win already knows who to sell to next" },
      { name: "description", content: "Upload a won SOW. Encore finds look-alike companies, proves it with quoted evidence, maps the buying committee and drafts outreach you approve." },
      { property: "og:title", content: "Encore — your last win already knows who to sell to next" },
      { property: "og:description", content: "Look-alike accounts, quoted evidence, buying committees and approved outreach from a single SOW." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main><LandingStory /></main>
      <SiteFooter />
    </div>
  );
}
