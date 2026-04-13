# FF Player

FF Player is the playback and casting client for the FF1 art computer (running FF OS). It renders DP1 playlists (images, video, audio, and interactive web content), responds to cast commands, and persists device state so the display can recover after restarts.

## Features

- **DP1 playlist playback:** Renders DP1 playlists with mixed media types.
- **Cast command handling:** Supports display, move, refresh, and display settings commands.
- **Device state persistence:** Stores boot playlists, cast info, and display settings locally.
- **Scheduled playback:** Handles scheduled DP1 tasks.
- **Remote config defaults:** Loads runtime settings from `/configs/display.json` with fallbacks.

## Getting Started

### Prerequisites

- Node.js (v18.x or higher)
- npm (v6.x or higher) or yarn

### Installation

1. Clone the repository:

   ```bash
   git clone git@github.com:feral-file/ff-player.git
   ```

2. Navigate to the project directory:

   ```bash
   cd ff-player
   ```

3. Install the project dependencies:

   ```bash
   npm install
   # or
   yarn install
   ```

### Running the Project

```bash
npm run dev
# or
yarn dev
```

Open `http://localhost:3000` to view the app.

## Verification

Use the canonical local verification command before review handoff:

```bash
npm run post-implement-check
npm run verify
```

Use `npm run post-implement-check` first to auto-fix and lint only the files changed against `main`, then run `npm run verify` for the changed-file lint plus production build path. Changed React code must satisfy `react-hooks/exhaustive-deps`, and changed code is also held to file/function/parameter size limits. Untouched legacy files can stay as-is until they are part of a feature change. See [`docs/verification.md`](docs/verification.md) for the verification contract and CI parity details.

## Runtime Configuration

- `https://raw.githubusercontent.com/bitmark-inc/feral-file-docs/main/configs/display.json` provides `duration` (version check interval) and `defaultPlaylistURL`.
- `https://display.feralfile.com/version.json` provides the current app version for reload checks.

In production these files are typically served by the host/CDN; in local dev, stubs live in `public/`.

## Project Structure

```
.
├── public/               # Static assets and runtime config
├── src/                  # Source files
│   ├── components/       # React components
│   ├── services/         # Cast, DP1, and device services
│   ├── utils/            # Utility functions and helpers
│   ├── models/           # TypeScript models and types
│   └── app/              # Next.js app routes
├── package.json          # Project metadata and dependencies
└── README.md             # Project documentation
```

## Contributing

Contributions are welcome. Please fork the repository and submit a pull request with your changes. Ensure your code follows the project's coding standards and includes appropriate tests.

For AI-assisted changes or repo workflow updates, start with [`AGENTS.md`](AGENTS.md) and [`docs/review-workflow.md`](docs/review-workflow.md).
