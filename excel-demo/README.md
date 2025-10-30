# Excel Demo

> ⚠️ **IMPORTANT**: This is a demo application by Anthropic. It is intended for local development only and should NOT be deployed to production or used at scale.

A demonstration desktop application powered by Claude and the [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-overview), showcasing AI-powered spreadsheet creation, analysis, and manipulation capabilities.

## What This Demo Shows

This Electron-based desktop application demonstrates how to:
- Create sophisticated Excel spreadsheets with formulas, formatting, and multiple sheets
- Analyze and manipulate existing spreadsheet data
- Use Claude to assist with data organization and spreadsheet design
- Work with Python scripts to generate complex spreadsheet structures
- Integrate the Claude Agent SDK with desktop applications

### Example Use Cases

The `agent/` folder contains Python examples including:
- **Workout Tracker**: A fitness log with automatic summary statistics and multiple sheets
- **Budget Tracker**: Financial tracking with formulas and data validation
- Custom spreadsheet generation with styling, borders, and conditional formatting

## Prerequisites

- [Node.js 18+](https://nodejs.org) or [Bun](https://bun.sh)
- An Anthropic API key ([get one here](https://console.anthropic.com))
- Python 3.9+ (for the Python agent examples)
- LibreOffice (optional, for formula recalculation)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/anthropics/sdk-demos.git
cd sdk-demos/excel-demo
```

2. Install dependencies:
```bash
npm install
# or bun install
```

3. Configure your Anthropic API key:
   - Set the `ANTHROPIC_API_KEY` environment variable, or
   - The application will prompt you on first run

4. Run the Electron application:
```bash
npm start
# or bun start
```

## Working with Python Examples

The `agent/` directory contains Python scripts demonstrating spreadsheet generation:

### Setup Python Environment

```bash
cd agent
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### Run Example Scripts

```bash
# Create a workout tracker
python create_workout_tracker.py

# Create a budget tracker
python create_budget_tracker.py
```

See the [agent/README.md](./agent/README.md) for more details on the Excel agent setup and capabilities.

## Features

- **AI-Powered Spreadsheet Generation**: Let Claude create complex spreadsheets based on your requirements
- **Formula Management**: Work with Excel formulas, calculations, and automatic recalculation
- **Professional Styling**: Generate spreadsheets with headers, colors, borders, and formatting
- **Multi-Sheet Workbooks**: Create workbooks with multiple related sheets
- **Data Analysis**: Analyze existing spreadsheets and extract insights
- **Desktop Integration**: Native desktop application built with Electron

## Project Structure

```
excel-demo/
├── agent/              # Python examples and Excel agent setup
│   ├── create_workout_tracker.py
│   ├── create_budget_tracker.py
│   └── README.md       # Excel agent documentation
├── src/
│   ├── main/          # Electron main process
│   └── renderer/      # React UI components
└── package.json
```

## Resources

- [Claude Agent SDK Documentation](https://docs.claude.com/en/api/agent-sdk/overview)
- [Electron Documentation](https://www.electronjs.org/docs/latest/)
- [openpyxl Documentation](https://openpyxl.readthedocs.io/) (Python library used)

## Support

This is a demo application provided as-is. For issues related to:
- **Claude Agent SDK**: [SDK Documentation](https://docs.anthropic.com/claude-code)
- **Demo Issues**: [GitHub Issues](https://github.com/anthropics/sdk-demos/issues)
- **API Questions**: [Anthropic Support](https://support.anthropic.com)

## License

MIT - This is sample code for demonstration purposes.

---

Built by Anthropic to demonstrate the [Claude Agent SDK](https://github.com/anthropics/claude-code-sdk)
