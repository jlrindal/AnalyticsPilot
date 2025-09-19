# Analytics Pilot

AI integration for Power BI semantic models

## Overview

Analytics Pilot is an Electron-based application that connects your Power BI semantic model to LLM APIs, making natural language DAX generation and streamlined DAX development faster and more efficient.

## Features

- **Power BI Integration**: Connect to both local Power BI Desktop models and Power BI Service workspaces
- **AI-Powered Analysis**: Use various AI providers (OpenAI, Anthropic, Ollama) to analyze your model meta-data
- **Natural Language Queries**: Generate DAX measures, calculated columns, and tables using natural language
- **Multiple AI Provider Support**: Configure different AI providers based on your needs, control your token cost (currently, there is no auto-model selection to ensure you are not using too big a model for the job. You should monitor your API costs).
- **Cross-Platform**: Available for Windows, macOS, and Linux

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- Visual Studio Build Tools
- .NET SDK
- Power BI Desktop (for local model connections)
- An AI provider API key (optional for local providers like Ollama)

### Installation (this is also available for download at www.AnalyticsPilot.com)

1. Clone the repository:
   ```bash
   git clone https://github.com/jlrindal/AnalyticsPilot.git
   cd AnalyticsPilot
   ```
   
2. Install dependencies ** NOTE: IF INSTALLING IN AN ENVIRONMENT WITH A RESTRICTED IT NETWORK, RUN THIS: set NODE_TLS_REJECT_UNATHORIZED=0, THEN RUN THE BELOW COMMAND AND RESET TO 1 AFTER **:
   ```bash
   npm install
   ```
   
3. Build the backend:
   ```bash
   # Navigate to the bridge folder (ensure you have dotnet installed)
   cd bridge
   # You may have to move this back to the bridge folder, depending upon where it is created (likely in bin/Release/net6.0/win-x64/publish/)
   dotnet publish -c Release -r win-x64 --self-contained -p:PublishSingleFile=true


4. Start the application:
   ```bash
   npm start
   ```

## Configuration

1. Launch the application
2. Go to Settings to configure your AI provider
3. Enter your API credentials and select your preferred AI model
4. Connect to your Power BI models (local or service)

## Supported AI Providers (Tested and working)

- OpenAI
- Anthropic
- Ollama (This is buggy/unstable. If your machine is underpowered, this feature is often useless.)
- Custom API endpoints

## License

Copyright (c) 2024 Torch Stone LLC

This software is free to use for personal and non-commercial purposes. Commercial use requires explicit permission from Torch Stone LLC or Jeremy Rindal. See the [LICENSE](LICENSE) file for full details.

## Contributing

This project is open source but commercial use is restricted. Contributions for personal and educational use are welcome.

## Contact

For commercial licensing inquiries, please contact Torch Stone LLC or Jeremy Rindal.

---

Created by Torch Stone LLC // Jeremy Rindal
