# Analytics Pilot

AI integration for Power BI semantic models

## Overview

Analytics Pilot is an Electron-based application that provides AI-powered analysis capabilities for Power BI semantic models. It enables users to interact with their Power BI data using natural language queries and AI assistance.

## Features

- **Power BI Integration**: Connect to both local Power BI Desktop models and Power BI Service workspaces
- **AI-Powered Analysis**: Use various AI providers (OpenAI, Anthropic, Google, Ollama) to analyze your data
- **Natural Language Queries**: Generate DAX measures, calculated columns, and tables using natural language
- **Multiple AI Provider Support**: Configure different AI providers based on your needs
- **Cross-Platform**: Available for Windows, macOS, and Linux

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- Power BI Desktop (for local model connections)
- An AI provider API key (optional for local providers like Ollama)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/jlrindal/AnalyticsPilot.git
   cd AnalyticsPilot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the application:
   ```bash
   npm start
   ```

### Building

To build the application for distribution:

```bash
# For Windows
npm run dist:win

# For macOS
npm run dist:mac

# For Linux
npm run dist:linux
```

## Configuration

1. Launch the application
2. Go to Settings to configure your AI provider
3. Enter your API credentials and select your preferred AI model
4. Connect to your Power BI models (local or service)

## Supported AI Providers

- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude)
- Google (Gemini)
- Ollama (local models)
- Custom API endpoints

## License

Copyright (c) 2024 Torch Stone LLC

This software is free to use for personal and non-commercial purposes. Commercial use requires explicit permission from Torch Stone LLC or Jeremy Rindal. See the [LICENSE](LICENSE) file for full details.

## Contributing

This project is open source but commercial use is restricted. Contributions for personal and educational use are welcome.

## Contact

For commercial licensing inquiries, please contact Torch Stone LLC or Jeremy Rindal.

---

Created by Torch Stone LLC