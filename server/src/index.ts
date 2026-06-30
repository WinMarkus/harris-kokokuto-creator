import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { config, type PageOrientation } from "./config.js";
import { createCollagePdf } from "./pdf.js";
import { createThumbnail, decodeImageId, isUnlocked, listImages, unlockStorage } from "./storage.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors({ origin: config.clientOrigin }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, unlocked: isUnlocked(), storageMode: config.storageMode });
});

app.post("/api/unlock", async (request, response, next) => {
  try {
    const password = String(request.body?.password ?? "");
    await unlockStorage(password);
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/images", async (_request, response, next) => {
  try {
    const images = await listImages();
    response.json({ images });
  } catch (error) {
    next(error);
  }
});

app.get("/api/images/:id/thumbnail", async (request, response, next) => {
  try {
    const sourcePath = decodeImageId(request.params.id);
    const thumbnail = await createThumbnail(sourcePath);

    response.setHeader("Content-Type", "image/jpeg");
    response.setHeader("Cache-Control", "private, max-age=300");
    response.send(thumbnail);
  } catch (error) {
    next(error);
  }
});

app.post("/api/pdf", async (request, response, next) => {
  try {
    const imageIds = Array.isArray(request.body?.imageIds) ? request.body.imageIds : [];
    const header = String(request.body?.header ?? "").trim();
    const date = String(request.body?.date ?? "").trim();
    const orientation = normalizeOrientation(request.body?.orientation);
    const seed = Number.isFinite(Number(request.body?.seed)) ? Number(request.body.seed) : Date.now();
    const sourcePaths = imageIds.map((id) => decodeImageId(String(id)));

    const pdf = await createCollagePdf({
      sourcePaths,
      header,
      date,
      orientation,
      seed,
    });

    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", "inline; filename=kokokuto-collage.pdf");
    response.send(pdf);
  } catch (error) {
    next(error);
  }
});

const clientDist = path.resolve(__dirname, "../../client/dist");

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_request, response) => {
    response.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unknown server error.";
  response.status(400).json({ error: message });
});

app.listen(config.port, () => {
  console.log(`Harris Kokokuto Creator backend running on http://localhost:${config.port}`);
});

function normalizeOrientation(value: unknown): PageOrientation {
  return value === "landscape" ? "landscape" : "portrait";
}
