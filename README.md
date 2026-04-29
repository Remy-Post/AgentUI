# AgentUI

AgentUI is a powerful desktop application built with Electron that provides a rich chat interface wrapping the **Claude Agent SDK**. It enables users to interact with intelligent agents, manage skills, configure tools, and orchestrate subagents seamlessly from their desktop.

## 🏗️ Architecture

This project is structured as a monorepo managed with npm workspaces, divided into two primary packages:

1. **`agent-client` (Frontend)**
   - The user interface and Electron main process.
   - Built using **React**, **TypeScript**, and **Vite**.
   - Styling handled by **Tailwind CSS**.
   - State management powered by **Zustand** and **React Query**.
   
2. **`agent-server` (Backend)**
   - A local Node.js backend running **Express**.
   - Integrates directly with the `@anthropic-ai/claude-agent-sdk`.
   - Uses **Mongoose** (MongoDB) for persisting conversations, messages, settings, skills, subagents, and tools.
   - Handles real-time communication with the client using **Server-Sent Events (SSE)**.
   - Includes support for **Model Context Protocol (MCP)** integrations.

## ✨ Key Features

- **Interactive Chat UI**: A fluid, responsive chat interface designed specifically for interacting with AI agents.
- **Real-Time Streaming**: Responses from the agent are streamed back to the UI in real-time via SSE.
- **Agent Orchestration**: Manage subagents and specialized skills directly from the UI to create complex agentic workflows.
- **Dynamic Tool Management**: Configure and manage the tools your agents have access to.
- **Local History & Settings**: All your conversations, agent configurations, and API settings are securely stored locally via the backend database.
- **Cross-Platform**: Packaged for Windows, macOS, and Linux using Electron Builder.

## 🛠️ Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js**: v20.18 or higher recommended.
- **npm**: v10+ recommended.
- **MongoDB**: The server requires a local or remote MongoDB instance to store data.

## 🚀 Getting Started

### 1. Installation

Clone the repository and install the dependencies for all workspaces from the root directory:

```bash
npm install
```

### 2. Environment Configuration

You may need to configure environment variables for the backend server (e.g., API keys, MongoDB connection strings) to fully utilize the agents and models.

### 3. Development Mode

To run both the backend server and the Electron desktop application concurrently. This provides hot-reloading for the frontend UI:

```bash
npm run dev
```

## 📦 Building for Production

To compile the TypeScript code and build both the server and the client for production, run:

```bash
npm run build
```

### Packaging the Desktop App

You can package the application for your specific operating system using the following commands:

- **Windows:** `npm run build:win`
- **macOS:** `npm run build:mac`
- **Linux:** `npm run build:linux`
- **Unpacked (Testing):** `npm run build:unpack`

### Starting in Production Mode

To start the application locally in production mode (requires running `npm run build` first):

```bash
npm run start
```

## 📂 Project Structure Overview

```text
AgentUI/
├── agent-client/          # Electron app & React frontend
│   ├── src/main/          # Electron main process (Node.js)
│   ├── src/preload/       # Electron preload scripts
│   └── src/renderer/      # React frontend code
├── agent-server/          # Express backend & Claude SDK integration
│   ├── src/agent/         # Agent orchestration, SSE, sessions
│   ├── src/db/            # Mongoose models & connection
│   ├── src/mcp/           # Model Context Protocol (MCP) integration
│   └── src/routes/        # Express API routes
├── docs/                  # Project documentation
├── package.json           # Root workspace configuration
└── README.md              # Project documentation (this file)
```

## 🧪 Testing and Type Checking

To ensure code quality, you can run the built-in type checkers and test suites:

- **Run all type checks:** `npm run typecheck`
- **Run server tests:** `npm run test`
