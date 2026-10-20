import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Router, type IRouter } from "express";
import { DownloadTrackParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/downloads/:trackId", async (req, res): Promise<void> => {
  const parsed = DownloadTrackParams.safeParse(req.params);

  if (!parsed.success) {
    res.status(400).json({ error: "Unknown demo track" });
    return;
  }

  const { trackId } = parsed.data;
  const trackNumber = Number(trackId.slice("soundhelix-".length));
  const sourceUrl = `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${trackNumber}.mp3`;

  try {
    const audio = await fetch(sourceUrl, {
      headers: { Accept: "audio/mpeg" },
      signal: AbortSignal.timeout(30_000),
    });

    if (!audio.ok || !audio.body) {
      req.log.warn(
        { trackId, status: audio.status },
        "Demo audio source unavailable",
      );
      res.status(502).json({ error: "Demo audio source is unavailable" });
      return;
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${trackId}.mp3"`,
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=86400");

    const contentLength = audio.headers.get("content-length");
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    await pipeline(Readable.fromWeb(audio.body), res);
  } catch (error) {
    req.log.error({ err: error, trackId }, "Demo audio download failed");
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.status(502).json({ error: "Demo audio source is unavailable" });
  }
});

export default router;
