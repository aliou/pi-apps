export interface ExtensionManifestFieldSchema {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
}

export interface ExtensionManifest {
  name: string;
  version: string;
  description?: string;
  keywords: string[];
  homepage?: string;
  repository?: string;
  tools: string[];
  providers: string[];
  skills: string[];
  schema?: {
    type?: string;
    properties?: Record<string, ExtensionManifestFieldSchema>;
    required?: string[];
  };
  fetchedAt: string;
}

interface NpmPackageDocument {
  name?: string;
  version?: string;
  description?: string;
  keywords?: string[];
  homepage?: string;
  repository?: string | { url?: string };
  pi?: {
    tools?: string[];
    providers?: string[];
    skills?: string[];
  };
}

interface NpmPackument {
  name?: string;
  "dist-tags"?: { latest?: string };
  versions?: Record<string, NpmPackageDocument>;
}

interface CacheEntry {
  manifest: ExtensionManifest | null;
  fetchedAt: number;
}

export class ExtensionManifestService {
  private cache = new Map<string, CacheEntry>();

  constructor(
    private readonly options: {
      ttlMs?: number;
      registryBaseUrl?: string;
      schemaBaseUrl?: string;
      fetchImpl?: typeof fetch;
    } = {},
  ) {}

  async getManifest(packageName: string): Promise<ExtensionManifest | null> {
    const ttlMs = this.options.ttlMs ?? 5 * 60 * 1000;
    const now = Date.now();
    const cached = this.cache.get(packageName);
    if (cached && now - cached.fetchedAt < ttlMs) {
      return cached.manifest;
    }

    const fetchImpl = this.options.fetchImpl ?? fetch;
    const registryBaseUrl =
      this.options.registryBaseUrl ?? "https://registry.npmjs.org";

    const response = await fetchImpl(
      `${registryBaseUrl}/${encodeURIComponent(packageName)}`,
      {
        headers: { Accept: "application/json" },
      },
    );

    if (!response.ok) {
      this.cache.set(packageName, { manifest: null, fetchedAt: now });
      return null;
    }

    const packument = (await response.json()) as NpmPackument;
    const latestVersion = packument["dist-tags"]?.latest;
    const pkg =
      (latestVersion ? packument.versions?.[latestVersion] : undefined) ??
      (packument.versions ? Object.values(packument.versions).at(-1) : undefined);

    if (!pkg?.name || !pkg.version) {
      this.cache.set(packageName, { manifest: null, fetchedAt: now });
      return null;
    }

    const schema = await this.fetchSchema(pkg.name, pkg.version);
    const manifest: ExtensionManifest = {
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      keywords: pkg.keywords ?? [],
      homepage: pkg.homepage,
      repository: normalizeRepository(pkg.repository),
      tools: pkg.pi?.tools ?? [],
      providers: pkg.pi?.providers ?? [],
      skills: pkg.pi?.skills ?? [],
      schema,
      fetchedAt: new Date(now).toISOString(),
    };

    this.cache.set(packageName, { manifest, fetchedAt: now });
    return manifest;
  }

  private async fetchSchema(
    packageName: string,
    version: string,
  ): Promise<ExtensionManifest["schema"] | undefined> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const schemaBaseUrl = this.options.schemaBaseUrl ?? "https://unpkg.com";
    const response = await fetchImpl(
      `${schemaBaseUrl}/${packageName}@${version}/schema.json`,
      {
        headers: { Accept: "application/json" },
      },
    );

    if (!response.ok) {
      return undefined;
    }

    const schema = (await response.json()) as ExtensionManifest["schema"];
    if (!schema || typeof schema !== "object") {
      return undefined;
    }

    return {
      type: schema.type,
      properties: schema.properties,
      required: schema.required,
    };
  }
}

function normalizeRepository(
  repository: NpmPackageDocument["repository"],
): string | undefined {
  if (!repository) return undefined;
  if (typeof repository === "string") return repository;
  return repository.url;
}
