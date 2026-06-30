import PDFDocument from "pdfkit";
import sharp from "sharp";
import type { PageOrientation } from "./config.js";
import { createSeededRandom, shuffle } from "./random.js";
import { readImageBuffer } from "./storage.js";

export type PdfRequest = {
  sourcePaths: string[];
  header: string;
  date: string;
  orientation: PageOrientation;
  seed: number;
};

type PreparedImage = {
  sourcePath: string;
  buffer: Buffer;
  width: number;
  height: number;
};

const A4 = {
  portrait: { width: 595.28, height: 841.89 },
  landscape: { width: 841.89, height: 595.28 },
};

export async function createCollagePdf(request: PdfRequest): Promise<Buffer> {
  const orientation = request.orientation === "landscape" ? "landscape" : "portrait";
  const random = createSeededRandom(request.seed || Date.now());
  const images = shuffle(await prepareImages(request.sourcePaths), random);
  const page = A4[orientation];

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: orientation,
      margin: 0,
      autoFirstPage: true,
      info: {
        Title: request.header || "Harris Kokokuto Creator",
        Creator: "Harris Kokokuto Creator",
      },
    });

    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    drawPage(doc, page.width, page.height, {
      header: request.header,
      date: request.date,
      images,
      random,
    });

    doc.end();
  });
}

async function prepareImages(sourcePaths: string[]): Promise<PreparedImage[]> {
  return Promise.all(
    sourcePaths.map(async (sourcePath) => {
      const input = await readImageBuffer(sourcePath);
      const pipeline = sharp(input).rotate();
      const metadata = await pipeline.metadata();
      const buffer = await sharp(input).rotate().jpeg({ quality: 88 }).toBuffer();

      return {
        sourcePath,
        buffer,
        width: metadata.width ?? 1,
        height: metadata.height ?? 1,
      };
    }),
  );
}

function drawPage(
  doc: PDFKit.PDFDocument,
  pageWidth: number,
  pageHeight: number,
  options: {
    header: string;
    date: string;
    images: PreparedImage[];
    random: () => number;
  },
) {
  const margin = 34;
  const headerHeight = 78;
  const contentX = margin;
  const contentY = margin + headerHeight;
  const contentWidth = pageWidth - margin * 2;
  const contentHeight = pageHeight - contentY - margin;

  doc.rect(0, 0, pageWidth, pageHeight).fill("#ffffff");

  doc
    .fillColor("#111111")
    .font("Helvetica-Bold")
    .fontSize(22)
    .text(options.header || " ", margin, margin - 2, {
      width: pageWidth - margin * 2 - 150,
      lineGap: 2,
    });

  doc
    .font("Helvetica")
    .fontSize(12)
    .fillColor("#444444")
    .text(options.date || " ", pageWidth - margin - 130, margin + 6, {
      width: 130,
      align: "right",
    });

  doc
    .moveTo(margin, margin + 47)
    .lineTo(pageWidth - margin, margin + 47)
    .strokeColor("#dddddd")
    .lineWidth(1)
    .stroke();

  if (options.images.length === 0) {
    doc
      .font("Helvetica")
      .fontSize(14)
      .fillColor("#777777")
      .text("No images selected.", contentX, contentY + 30, {
        width: contentWidth,
        align: "center",
      });
    return;
  }

  const { columns, rows } = getGrid(options.images.length, contentWidth, contentHeight);
  const cellWidth = contentWidth / columns;
  const cellHeight = contentHeight / rows;
  const cellPadding = Math.max(8, Math.min(16, Math.min(cellWidth, cellHeight) * 0.08));

  options.images.forEach((image, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cellX = contentX + column * cellWidth;
    const cellY = contentY + row * cellHeight;

    const maxWidth = Math.max(20, cellWidth - cellPadding * 2 - 10);
    const maxHeight = Math.max(20, cellHeight - cellPadding * 2 - 10);
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;

    const jitterX = (options.random() - 0.5) * Math.min(14, cellWidth * 0.08);
    const jitterY = (options.random() - 0.5) * Math.min(14, cellHeight * 0.08);
    const rotation = (options.random() - 0.5) * 5.5;

    const x = cellX + (cellWidth - drawWidth) / 2 + jitterX;
    const y = cellY + (cellHeight - drawHeight) / 2 + jitterY;
    const centerX = x + drawWidth / 2;
    const centerY = y + drawHeight / 2;

    doc.save();
    doc.rotate(rotation, { origin: [centerX, centerY] });

    doc
      .roundedRect(x - 4, y - 4, drawWidth + 8, drawHeight + 8, 6)
      .fill("#ffffff")
      .strokeColor("#eeeeee")
      .lineWidth(0.8)
      .stroke();

    doc.image(image.buffer, x, y, {
      width: drawWidth,
      height: drawHeight,
    });

    doc.restore();
  });
}

function getGrid(imageCount: number, contentWidth: number, contentHeight: number) {
  const targetRatio = contentWidth / contentHeight;
  let best = { columns: 1, rows: imageCount, score: Number.POSITIVE_INFINITY };

  for (let columns = 1; columns <= imageCount; columns += 1) {
    const rows = Math.ceil(imageCount / columns);
    const gridRatio = columns / rows;
    const emptySlots = columns * rows - imageCount;
    const score = Math.abs(gridRatio - targetRatio) + emptySlots * 0.12;

    if (score < best.score) {
      best = { columns, rows, score };
    }
  }

  return best;
}
