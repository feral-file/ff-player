# Feral File Display App

A Next.js application for displaying digital artworks in a playlist format. This is player of FF1 - The art computer by Feral File.

## Table of Contents

- [Features](#features)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running the Project](#running-the-project)
- [Usage](#usage)
  - [Artwork Display](#artwork-display)
  - [Playlist Management](#playlist-management)
  - [Display Settings](#display-settings)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Artwork Playlist Display:** Displays digital artworks in a timed playlist format with automatic progression
- **Multi-format Support:** Supports images, videos, audio, PDFs, and interactive content (iframes)
- **Display Settings:** Configurable scaling, background colors, margins, and playback settings
- **CDP Communication:** Real-time communication for remote control and playlist updates
- **Device Management:** Handles device rotation, network status, and display preferences
- **Error Recovery:** Automatic WebGL context recovery and error handling
- **Cursor Tracking:** Multi-cursor position tracking for interactive displays

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed on your local machine:

- Node.js (v18.x or higher)
- npm (v6.x or higher) or yarn

### Installation

1. Clone the repository:

   ```bash
   git clone git@github.com:bitmark-inc/feralfile-display-js.git
   ```

2. Navigate to the project directory:

   ```bash
   cd feralfile-display-js
   ```

3. Install the project dependencies:

   ```bash
   npm install
   # or
   yarn install
   ```

### Running the Project

To start the development server:

```bash
npm run dev
# or
yarn dev
```

Open your browser and navigate to `http://localhost:3000` to view the application.

## Usage

### Artwork Display

The application displays digital artworks in a full-screen format with support for:

- **Images:** JPG, PNG, GIF, and other image formats
- **Videos:** MP4, WebM, and HLS streaming
- **Audio:** MP3, WAV, and other audio formats
- **Interactive Content:** HTML5 content via iframes
- **PDFs:** PDF documents in iframe viewers

### Playlist Management

- **Timed Playlists:** Artworks are displayed for specified durations
- **Automatic Progression:** Seamless transitions between artworks
- **Remote Control:** CDP request for playlist navigation and updates

### Display Settings

Configure how artworks are displayed:

- **Scaling:** Fit, fill, or custom scaling options
- **Background:** Custom background colors
- **Margins:** Adjustable margins around content
- **Playback:** Auto-play and loop settings

## Project Structure

Here's a brief overview of the project's structure:

```
.
├── public/               # Static assets and fonts
├── src/                  # Source files
│   ├── app/              # Next.js app router pages
│   │   ├── page.tsx      # Home page
│   │   ├── playlist/     # Playlist display page
│   ├── components/       # React components
│   │   ├── artwork-player/  # Artwork display component
│   │   ├── loading/      # Loading components
│   │   └── ...           # Other UI components
│   ├── context/          # React context providers
│   ├── models/           # TypeScript type definitions
│   ├── services/         # Business logic and API services
│   │   ├── custom-hooks/ # Custom React hooks
│   │   └── cdp-handler/  # Chrome DevTools Protocol handler
│   └── utils/            # Utility functions and helpers
├── package.json          # Project metadata and dependencies
└── README.md             # Project documentation
```

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request with your changes. Ensure your code follows the project's coding standards and includes appropriate tests.
