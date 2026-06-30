import fs from "node:fs/promises";
import path from "node:path";
import { createClient, type WebDAVClient } from "webdav";
import sharp from "sharp";
import { config } from "./config.js";

export type ImageItem = {
  id: string;
  name: string;
  sourcePath: string;
  size?: number;
  lastModified?: string;
};

let webdavClient: WebDAVClient | null = null;
let unlocked = false;

export function isUnlocked() {
  return config.storageMode === "local" || unlocked;
}

export function encodeImageId(sourcePath: string) {
  return Buffer.from(sourcePath, "utf8").toString("base64url");
}

export function decodeImageId(id: string) {
  return Buffer.from(id, "base64url").toString("utf8");
}

export async function unlockStorage(password: string) {
  if (config.storageMode === "local") {
    await assertLocalFolderExists();
    unlocked = true;
    return;
  }

  if (!config.synologyWebdavUrl) {
    throw new Error("SYNOLOGY_WEBDAV_URL is missing in .env.");
  }

  if (!config.synologyUsername) {
    throw new Error("SYNOLOGY_USERNAME is missing in .env.");
  }

  if (!password) {
    throw new Error("Password is required.");
  }

  const client = createClient(config.synologyWebdavUrl, {
    username: config.synologyUsername,
    password,
  });

  // Lightweight auth + folder sanity check.
  await client.getDirectoryContents("/", { deep: false });

  webdavClient = client;
  unlocked = true;
}

export async function listImages(): Promise<ImageItem[]> {
  assertUnlocked();

  if (config.storageMode === "local") {
    return listLocalImages();
  }

  if (!webdavClient) {
    throw new Error("WebDAV client is not initialized.");
  }

  const contents = await webdavClient.getDirectoryContents("/", { deep: true });
  const entries = Array.isArray(contents) ? contents : [contents];

  return entries
    .filter((entry) => entry.type === "file" && isSupportedImage(entry.filename ?? entry.basename ?? ""))
    .flatMap((entry) => {
      const sourcePath = entry.filename ?? entry.basename;

      if (!sourcePath) {
        return [];
      }

      return [
        {
          id: encodeImageId(sourcePath),
          name: entry.basename ?? path.posix.basename(sourcePath),
          sourcePath,
          size: entry.size,
          lastModified: entry.lastmod,
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export async function readImageBuffer(sourcePath: string): Promise<Buffer> {
  assertUnlocked();

  if (config.storageMode === "local") {
    const fullPath = resolveSafeLocalPath(sourcePath);
    return fs.readFile(fullPath);
  }

  if (!webdavClient) {
    throw new Error("WebDAV client is not initialized.");
  }

  const content = await webdavClient.getFileContents(sourcePath, { format: "binary" });

  if (Buffer.isBuffer(content)) {
    return content;
  }

  if (content instanceof ArrayBuffer) {
    return Buffer.from(content);
  }

  return Buffer.from(content as Uint8Array);
}

export async function createThumbnail(sourcePath: string) {
  const input = await readImageBuffer(sourcePath);

  return sharp(input)
    .rotate()
    .resize({ width: 320, height: 240, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 76 })
    .toBuffer();
}

async function listLocalImages(): Promise<ImageItem[]> {
  await assertLocalFolderExists();

  const results: ImageItem[] = [];

  async function walk(currentFolder: string) {
    const entries = await fs.readdir(currentFolder, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentFolder, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile() || !isSupportedImage(entry.name)) {
        continue;
      }

      const stats = await fs.stat(fullPath);
      const relativePath = path.relative(config.localImageFolder, fullPath);
      const normalizedPath = relativePath.split(path.sep).join(path.posix.sep);

      results.push({
        id: encodeImageId(normalizedPath),
        name: entry.name,
        sourcePath: normalizedPath,
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
      });
    }
  }

  await walk(config.localImageFolder);

  return results.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

function isSupportedImage(filename: string) {
  const extension = path.extname(filename).toLowerCase();
  return config.imageExtensions.has(extension);
}

function assertUnlocked() {
  if (!isUnlocked()) {
    throw new Error("Storage is locked. Enter the folder password first.");
  }
}

async function assertLocalFolderExists() {
  if (!config.localImageFolder) {
    throw new Error("LOCAL_IMAGE_FOLDER is missing in .env.");
  }

  const stats = await fs.stat(config.localImageFolder);

  if (!stats.isDirectory()) {
    throw new Error("LOCAL_IMAGE_FOLDER must point to a directory.");
  }
}

function resolveSafeLocalPath(sourcePath: string) {
  const baseFolder = path.resolve(config.localImageFolder);
  const fullPath = path.resolve(baseFolder, sourcePath);
  const relativePath = path.relative(baseFolder, fullPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Invalid image path.");
  }

  return fullPath;
}
