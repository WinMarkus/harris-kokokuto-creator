import dotenv from "dotenv";

dotenv.config();

export type StorageMode = "webdav" | "local";
export type PageOrientation = "portrait" | "landscape";

const storageMode = (process.env.STORAGE_MODE ?? "webdav") as StorageMode;

if (storageMode !== "webdav" && storageMode !== "local") {
  throw new Error("STORAGE_MODE must be either 'webdav' or 'local'.");
}

export const config = {
  port: Number.parseInt(process.env.PORT ?? "3001", 10),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  storageMode,
  synologyWebdavUrl: process.env.SYNOLOGY_WEBDAV_URL ?? "",
  synologyUsername: process.env.SYNOLOGY_USERNAME ?? "",
  localImageFolder: process.env.LOCAL_IMAGE_FOLDER ?? "",
  imageExtensions: new Set([".jpg", ".jpeg", ".png", ".webp"]),
};
