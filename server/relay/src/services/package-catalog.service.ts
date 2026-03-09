import type { ExtensionManifestService } from "./extension-manifest.service";

export interface CatalogPackage {
  name: string;
  version: string;
  description?: string;
  keywords: string[];
  homepage?: string;
  repository?: string;
  extensionMeta?: {
    tools?: string[];
    providers?: string[];
    skills?: string[];
  };
}

interface NpmSearchResponse {
  objects?: Array<{
    package: {
      name: string;
      version: string;
      description?: string;
      keywords?: string[];
      links?: {
        homepage?: string;
        repository?: string;
      };
    };
  }>;
}

interface CatalogCacheEntry {
  data: CatalogPackage[];
  fetchedAt: number;
}

export class PackageCatalogService {
  private cache = new Map<string, CatalogCacheEntry>();
  private lastRequestAt = 0;

  get manifestService(): ExtensionManifestService {
    return this._manifestService;
  }

  constructor(
    private readonly _manifestService: ExtensionManifestService,
    private readonly options: {
      ttlMs?: number;
      minIntervalMs?: number;
      registrySearchUrl?: string;
      fetchImpl?: typeof fetch;
    } = {},
  ) {}

  async search(params: {
    tag?: string;
    query?: string;
    limit?: number;
  }): Promise<{
    packages: CatalogPackage[];
    fetchedAt: string | null;
    stale: boolean;
  }> {
    const tag = params.tag?.trim() || "pi-package";
    const query = params.query?.trim() ?? "";
    const limit = clamp(params.limit ?? 20, 1, 50);
    const cacheKey = JSON.stringify({ tag, query, limit });
    const cached = this.cache.get(cacheKey);
    const ttlMs = this.options.ttlMs ?? 5 * 60 * 1000;
    const now = Date.now();

    if (cached && now - cached.fetchedAt < ttlMs) {
      return {
        packages: cached.data,
        fetchedAt: new Date(cached.fetchedAt).toISOString(),
        stale: false,
      };
    }

    try {
      await this.throttle();
      const fetchImpl = this.options.fetchImpl ?? fetch;
      const registrySearchUrl =
        this.options.registrySearchUrl ??
        "https://registry.npmjs.org/-/v1/search";
      const text = [`keywords:${tag}`, query].filter(Boolean).join(" ");
      const response = await fetchImpl(
        `${registrySearchUrl}?text=${encodeURIComponent(text)}&size=${limit}`,
        { headers: { Accept: "application/json" } },
      );

      if (!response.ok) {
        throw new Error(`npm registry search failed with ${response.status}`);
      }

      const payload = (await response.json()) as NpmSearchResponse;
      const packages = await Promise.all(
        (payload.objects ?? []).map(async (result) => {
          const pkg = result.package;
          const manifest = await this._manifestService.getManifest(pkg.name);
          return {
            name: pkg.name,
            version: manifest?.version ?? pkg.version,
            description: manifest?.description ?? pkg.description,
            keywords: manifest?.keywords ?? pkg.keywords ?? [],
            homepage: manifest?.homepage ?? pkg.links?.homepage,
            repository: manifest?.repository ?? pkg.links?.repository,
            extensionMeta:
              manifest &&
              (manifest.tools.length > 0 ||
                manifest.providers.length > 0 ||
                manifest.skills.length > 0)
                ? {
                    tools: manifest.tools,
                    providers: manifest.providers,
                    skills: manifest.skills,
                  }
                : undefined,
          } satisfies CatalogPackage;
        }),
      );

      this.cache.set(cacheKey, { data: packages, fetchedAt: now });
      return {
        packages,
        fetchedAt: new Date(now).toISOString(),
        stale: false,
      };
    } catch {
      if (cached) {
        return {
          packages: cached.data,
          fetchedAt: new Date(cached.fetchedAt).toISOString(),
          stale: true,
        };
      }

      throw new Error("Package catalog unavailable");
    }
  }

  private async throttle(): Promise<void> {
    const minIntervalMs = this.options.minIntervalMs ?? 300;
    const waitMs = Math.max(0, this.lastRequestAt + minIntervalMs - Date.now());
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    this.lastRequestAt = Date.now();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
