# Harris Kokokuto Creator

Tiny local-first app for making a printable A4 image collage PDF from a password-protected Synology folder.

The UI is intentionally plain:

1. enter the Synology folder password
2. select images
3. enter header and date
4. choose A4 portrait or landscape
5. generate, shuffle, print

## Current MVP

- React + Vite frontend
- Express backend
- Synology WebDAV image access
- optional local-folder mode for a mounted NAS folder
- reads `.jpg`, `.jpeg`, `.png`, `.webp`
- one-page A4 PDF
- header + date fixed at the top
- random-but-contained grid layout
- small random rotations
- no intentional image cropping
- PDF preview and print button

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`.

### Synology WebDAV mode

```env
STORAGE_MODE=webdav
SYNOLOGY_WEBDAV_URL=https://your-synology-host:5006/path/to/image-folder/
SYNOLOGY_USERNAME=your-synology-user
```

The password is not stored in `.env`. The user enters it in the app after startup. The backend keeps it only in memory until the server is restarted.

### Local folder mode

Use this when the Synology folder is already mounted on the machine running the backend.

```env
STORAGE_MODE=local
LOCAL_IMAGE_FOLDER=/Volumes/your-mounted-synology-folder
```

In local mode the password screen still exists, but the backend does not need the password. This is mainly useful during development.

## Development

```bash
npm run dev
```

Frontend:

```txt
http://localhost:5173
```

Backend:

```txt
http://localhost:3001
```

## Production-ish local build

```bash
npm run build
npm start
```

Then open:

```txt
http://localhost:3001
```

## Notes

This is designed as a local/home-network app. Do not expose it publicly without adding real authentication and HTTPS hardening.
