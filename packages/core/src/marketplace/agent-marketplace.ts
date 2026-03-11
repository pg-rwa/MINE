import { AgentManifest } from '../types';

export interface MarketplaceListing {
  manifest: AgentManifest;
  downloads: number;
  rating: number;
  reviews: number;
  verified: boolean;
  featured: boolean;
  publishedAt: Date;
}

/**
 * AgentMarketplace manages third-party agent discovery and installation.
 * Revenue share: 70% developer, 30% MINE platform.
 */
export class AgentMarketplace {
  private listings: Map<string, MarketplaceListing> = new Map();

  publish(manifest: AgentManifest): MarketplaceListing {
    const listing: MarketplaceListing = {
      manifest,
      downloads: 0,
      rating: 0,
      reviews: 0,
      verified: false,
      featured: false,
      publishedAt: new Date(),
    };

    this.listings.set(manifest.id, listing);
    return listing;
  }

  search(query: string, category?: AgentManifest['category']): MarketplaceListing[] {
    const q = query.toLowerCase();
    return Array.from(this.listings.values()).filter(
      (l) =>
        (!category || l.manifest.category === category) &&
        (l.manifest.name.toLowerCase().includes(q) ||
          l.manifest.description.toLowerCase().includes(q))
    );
  }

  getFeatured(): MarketplaceListing[] {
    return Array.from(this.listings.values())
      .filter((l) => l.featured)
      .sort((a, b) => b.downloads - a.downloads);
  }

  getTopRated(limit = 20): MarketplaceListing[] {
    return Array.from(this.listings.values())
      .filter((l) => l.reviews >= 5)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit);
  }

  recordDownload(agentId: string): void {
    const listing = this.listings.get(agentId);
    if (listing) listing.downloads++;
  }
}
