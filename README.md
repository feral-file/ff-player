# Feral File Display app

Feral File Display app designed to connect with a WebSocket server, process commands, and generate a Branch.io deep link for further actions. 

## Table of Contents

- [Features](#features)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running the Project](#running-the-project)
- [Usage](#usage)
  - [WebSocket Communication](#websocket-communication)
  - [Branch.io Integration](#branchio-integration)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

## Features

- **WebSocket Communication:** Establishes a connection with a WebSocket server and processes incoming commands.
- **Branch.io Integration:** Generates a Branch.io deep link based on device information and displays it as a QR code.
- **Device Management:** Stores and retrieves device-related information using local storage.

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

### WebSocket Communication

The application connects to a WebSocket server to receive and process commands. It uses the `ReconnectingWebSocket` library to manage the WebSocket connection, ensuring it reconnects automatically if the connection is lost.

### Branch.io Integration

Once connected to the WebSocket server and receiving a location ID and topic ID, the application generates a Branch.io deep link. This link is then displayed as a QR code, allowing users to scan and continue the process on a mobile device.

## Project Structure

Here's a brief overview of the project's structure:

```
.
├── public/               # Static assets
├── src/                  # Source files
│   ├── components/       # React components
│   ├── services/         # Service files (e.g., WebSocket, Branch.io)
│   ├── utils/            # Utility functions and helpers
│   ├── types/            # TypeScript types and interfaces
│   ├── App.tsx           # Main application component
│   └── index.tsx         # Entry point for React
├── .env                  # Environment variables
├── package.json          # Project metadata and dependencies
└── README.md             # Project documentation
```

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request with your changes. Ensure your code follows the project's coding standards and includes appropriate tests.