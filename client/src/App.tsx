import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type ImageItem = {
  id: string;
  name: string;
  sourcePath: string;
  size?: number;
  lastModified?: string;
};

type Orientation = "portrait" | "landscape";

export default function App() {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [header, setHeader] = useState("Harris Kokokuto");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const pdfUrlRef = useRef<string | null>(null);

  const selectedCount = selectedIds.size;
  const canGenerate = unlocked && selectedCount > 0 && !loading;

  const selectedImages = useMemo(() => {
    return images.filter((image) => selectedIds.has(image.id));
  }, [images, selectedIds]);

  useEffect(() => {
    return () => {
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
      }
    };
  }, []);

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      await api("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      setUnlocked(true);
      setPassword("");
      await loadImages();
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function loadImages() {
    const result = await api<{ images: ImageItem[] }>("/api/images");
    setImages(result.images);
  }

  function toggleImage(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(images.map((image) => image.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function generatePdf() {
    if (!canGenerate) {
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageIds: selectedImages.map((image) => image.id),
          header,
          date,
          orientation,
          seed: Date.now(),
        }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error ?? "PDF generation failed.");
      }

      const blob = await response.blob();
      const nextUrl = URL.createObjectURL(blob);

      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
      }

      pdfUrlRef.current = nextUrl;
      setPdfUrl(nextUrl);
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function printPdf() {
    if (!pdfUrl) {
      setMessage("Generate a PDF first.");
      return;
    }

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.src = pdfUrl;

    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      window.setTimeout(() => iframe.remove(), 1000);
    };

    document.body.appendChild(iframe);
  }

  if (!unlocked) {
    return (
      <main className="app app--locked">
        <section className="card card--narrow">
          <h1>Harris Kokokuto Creator</h1>
          <p className="muted">Enter the Synology folder password once.</p>

          <form onSubmit={unlock} className="stack">
            <input
              autoFocus
              type="password"
              value={password}
              placeholder="Folder password"
              onChange={(event) => setPassword(event.target.value)}
            />
            <button type="submit" disabled={loading}>
              {loading ? "Unlocking…" : "Unlock images"}
            </button>
          </form>

          {message ? <p className="error">{message}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <h1>Harris Kokokuto Creator</h1>
          <p className="muted">{images.length} images found · {selectedCount} selected</p>
        </div>
        <div className="actions">
          <button type="button" onClick={generatePdf} disabled={!canGenerate}>
            {loading ? "Generating…" : "Generate PDF"}
          </button>
          <button type="button" onClick={generatePdf} disabled={!canGenerate}>
            Shuffle
          </button>
          <button type="button" onClick={printPdf} disabled={!pdfUrl}>
            Print
          </button>
        </div>
      </header>

      <section className="controls card">
        <label>
          Header
          <input value={header} onChange={(event) => setHeader(event.target.value)} />
        </label>
        <label>
          Date
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label>
          A4
          <select value={orientation} onChange={(event) => setOrientation(event.target.value as Orientation)}>
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </label>
        <div className="smallActions">
          <button type="button" onClick={selectAll}>Select all</button>
          <button type="button" onClick={clearSelection}>Clear</button>
          <button type="button" onClick={loadImages}>Reload</button>
        </div>
      </section>

      {message ? <p className="error">{message}</p> : null}

      <section className="layout">
        <div className="imageGrid card">
          {images.map((image) => {
            const selected = selectedIds.has(image.id);

            return (
              <button
                key={image.id}
                type="button"
                className={selected ? "thumb thumb--selected" : "thumb"}
                onClick={() => toggleImage(image.id)}
                title={image.sourcePath}
              >
                <img src={`/api/images/${image.id}/thumbnail`} alt="" loading="lazy" />
                <span>{image.name}</span>
              </button>
            );
          })}
        </div>

        <aside className="preview card">
          {pdfUrl ? (
            <iframe title="PDF preview" src={pdfUrl} />
          ) : (
            <div className="emptyPreview">PDF preview appears here.</div>
          )}
        </aside>
      </section>
    </main>
  );
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error ?? "Request failed.");
  }

  return response.json() as Promise<T>;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
