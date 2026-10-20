import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Router, type IRouter } from "express";
import {
  DownloadJamendoTrackParams,
  SearchMusicQueryParams,
  SearchMusicResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const JAMENDO_API = "https://api.jamendo.com/v3.0";
const PAGE_SIZE = 40;
const RESULT_LIMIT = 24;
const searchCache = new Map<
  string,
  { expiresAt: number; tracks: ReturnType<typeof SearchMusicResponse.parse> }
>();

type JamendoTrack = {
  id?: string;
  name?: string;
  artist_name?: string;
  album_name?: string | null;
  album_image?: string;
  image?: string;
  audio?: string;
  audiodownload?: string;
  audiodownload_allowed?: boolean;
  duration?: string | number;
  license_ccurl?: string;
  musicinfo?: { tags?: { genres?: string[] } };
};

type JamendoArtist = {
  id?: string;
  name?: string;
  tracks?: JamendoTrack[];
};

type JamendoResponse<T> = {
  headers?: { status?: string; code?: number; error_message?: string };
  results?: T[];
};

function getClientId(): string | null {
  return process.env.JAMENDO_CLIENT_ID?.trim() || null;
}

function createApiUrl(
  endpoint: string,
  clientId: string,
  params: Record<string, string | number>,
): URL {
  const url = new URL(`${JAMENDO_API}/${endpoint.replace(/^\/+/, "")}`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("format", "json");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function getJamendo<T>(
  endpoint: string,
  clientId: string,
  params: Record<string, string | number>,
): Promise<JamendoResponse<T>> {
  const response = await fetch(createApiUrl(endpoint, clientId, params), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Jamendo returned HTTP ${response.status}`);
  }

  const payload = (await response.json()) as JamendoResponse<T>;
  if (payload.headers?.status !== "success" || !Array.isArray(payload.results)) {
    throw new Error("Jamendo returned an invalid catalog response");
  }
  return payload;
}

function securePublicUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.protocol === "http:") url.protocol = "https:";
    return url.toString();
  } catch {
    return null;
  }
}

function mapDownloadableTrack(
  track: JamendoTrack,
  artistFallback?: string,
) {
  const id = track.id?.trim();
  const title = track.name?.trim();
  const artist = (track.artist_name || artistFallback || "").trim();
  const audioUrl = securePublicUrl(track.audio);

  if (
    !id ||
    !/^\d+$/.test(id) ||
    !title ||
    !artist ||
    !audioUrl ||
    track.audiodownload_allowed !== true ||
    !track.audiodownload
  ) {
    return null;
  }

  const duration = Number(track.duration);
  const genres = track.musicinfo?.tags?.genres;

  return {
    id,
    title,
    artist,
    album: track.album_name?.trim() || null,
    coverUrl: securePublicUrl(track.image || track.album_image),
    audioUrl,
    durationSeconds:
      Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 0,
    genre: genres?.find((genre) => typeof genre === "string" && genre.trim())?.trim() ?? "Independent",
    licenseUrl: securePublicUrl(track.license_ccurl),
    downloadAllowed: true as const,
  };
}

router.get("/music/search", async (req, res): Promise<void> => {
  const parsed = SearchMusicQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter at least two characters to search" });
    return;
  }

  const clientId = getClientId();
  if (!clientId) {
    res.status(503).json({ error: "Music search is not configured" });
    return;
  }

  const { q, offset } = parsed.data;
  const normalizedQuery = q.trim();
  const cacheKey = `${normalizedQuery.toLowerCase()}:${offset}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.tracks);
    return;
  }

  try {
    const baseParams = {
      limit: PAGE_SIZE,
      offset,
      order: "relevance",
      audioformat: "mp32",
      audiodlformat: "mp32",
      include: "licenses+musicinfo",
      imagesize: 300,
    };

    const [titleMatches, artistMatches] = await Promise.all([
      getJamendo<JamendoTrack>("tracks/", clientId, {
        ...baseParams,
        namesearch: normalizedQuery,
      }),
      getJamendo<JamendoArtist>("artists/", clientId, {
        namesearch: normalizedQuery,
        limit: 4,
        imagesize: 300,
      }),
    ]);

    const artists = (artistMatches.results ?? []).filter(
      (artist): artist is JamendoArtist & { id: string } =>
        typeof artist.id === "string" && /^\d+$/.test(artist.id),
    );
    const artistTracks =
      artists.length > 0
        ? await getJamendo<JamendoArtist>("artists/tracks/", clientId, {
            ...baseParams,
            id: artists.map((artist) => artist.id).join("+"),
          })
        : { results: [] };

    const rawTracks = [
      ...(titleMatches.results ?? []).map((track) => ({
        track,
        artist: undefined,
      })),
      ...(artistTracks.results ?? []).flatMap((artist) =>
        (artist.tracks ?? []).map((track) => ({
          track,
          artist: artist.name,
        })),
      ),
    ];

    const deduplicated = new Map<
      string,
      NonNullable<ReturnType<typeof mapDownloadableTrack>>
    >();
    for (const item of rawTracks) {
      const mapped = mapDownloadableTrack(item.track, item.artist);
      if (mapped && !deduplicated.has(mapped.id)) {
        deduplicated.set(mapped.id, mapped);
      }
    }

    const hasMore =
      (titleMatches.results?.length ?? 0) >= PAGE_SIZE ||
      (artistTracks.results ?? []).some(
        (artist) => (artist.tracks?.length ?? 0) >= PAGE_SIZE,
      );
    const payload = SearchMusicResponse.parse({
      tracks: Array.from(deduplicated.values()).slice(0, RESULT_LIMIT),
      hasMore,
      nextOffset: offset + PAGE_SIZE,
    });

    searchCache.set(cacheKey, {
      expiresAt: Date.now() + 60_000,
      tracks: payload,
    });
    if (searchCache.size > 150) {
      const now = Date.now();
      for (const [key, value] of searchCache) {
        if (value.expiresAt <= now) searchCache.delete(key);
      }
    }

    res.setHeader("Cache-Control", "private, max-age=30");
    res.json(payload);
  } catch (error) {
    req.log.error({ err: error }, "Jamendo music search failed");
    res.status(502).json({ error: "The music catalog could not be reached" });
  }
});

router.get(
  "/music/tracks/:trackId/download",
  async (req, res): Promise<void> => {
    const parsed = DownloadJamendoTrackParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid track ID" });
      return;
    }

    const clientId = getClientId();
    if (!clientId) {
      res.status(503).json({ error: "Music downloads are not configured" });
      return;
    }

    const trackId = parsed.data.trackId;

    try {
      const trackResponse = await getJamendo<JamendoTrack>(
        "tracks/",
        clientId,
        {
          id: trackId,
          limit: 1,
          include: "licenses",
          audiodlformat: "mp32",
        },
      );
      const track = trackResponse.results?.[0];

      if (!track) {
        res.status(404).json({ error: "Track not found" });
        return;
      }

      if (track.audiodownload_allowed !== true || !track.audiodownload) {
        res.status(403).json({ error: "This track is not available to download" });
        return;
      }

      const downloadUrl = createApiUrl("tracks/file/", clientId, {
        id: trackId,
        action: "download",
        audioformat: "mp32",
      });
      const audio = await fetch(downloadUrl, {
        redirect: "follow",
        signal: AbortSignal.timeout(45_000),
      });

      if (!audio.ok || !audio.body) {
        req.log.warn(
          { trackId, status: audio.status },
          "Jamendo audio source unavailable",
        );
        res.status(502).json({ error: "The audio file could not be reached" });
        return;
      }

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="jamendo-${trackId}.mp3"`,
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");

      const contentLength = audio.headers.get("content-length");
      if (contentLength && /^\d+$/.test(contentLength)) {
        res.setHeader("Content-Length", contentLength);
      }

      await pipeline(Readable.fromWeb(audio.body), res);
    } catch (error) {
      req.log.error({ err: error, trackId }, "Jamendo download failed");
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.status(502).json({ error: "The audio file could not be reached" });
    }
  },
);

export default router;
