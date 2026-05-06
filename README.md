# BMad-Stella: Streamlined AI-Powered Development Workflow

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org)
[![Built on BMad-Method](https://img.shields.io/badge/Built%20on-BMad%20Method-blue)](https://github.com/bmadcode/bmad-method)

A customized implementation of BMAD-METHOD™ optimized for **Claude Code CLI**, providing a streamlined development workflow with specialized AI agents for planning, development, testing, and code review.

## Overview

**BMad-Stella** is a focused, implementation-oriented workflow built on BMAD-METHOD™ foundations. It provides four specialized agents that work together seamlessly in Claude Code CLI to deliver high-quality software:

**Core Workflow:**

```
Planner → Dev → QA → Reviewer
         ↑______(if fixes needed)
```

**Key Features:**

- ✨ **Planner Agent (Alex)** - Transforms JIRA tickets into detailed implementation plans
- 💻 **Dev Agent (Bob)** - Executes tasks sequentially with comprehensive testing
- 🧪 **QA Agent (Quinn)** - Designs test strategies and ensures requirements traceability
- 🔍 **Reviewer Agent (Morgan)** - Reviews code and applies practical optimizations

**Built for:** Teams using JIRA, Confluence, and Claude Code CLI for agile development.

**📖 [Complete Stella User Guide](docs/stella-user-guide.md)** - Installation, workflow, and command reference

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org) v20+ installed
- [Claude Code CLI](https://docs.anthropic.com/claude/docs/claude-code) installed and configured
- JIRA account with access to your organization's instance
- Confluence page URL for architecture documentation (recommended)

### Installation (5 minutes)

**Run the interactive installer:**

```bash
npx bmad-stella install
```

**Follow the prompts:**

1. Provide your project directory path
2. Select **BMad Agile Core System**
3. Enter Confluence URL for architecture docs
4. Select **Claude Code** as IDE
5. Skip web bundles installation (enter `n`)
6. Allow Claude Code Permissions Setup (enter `y`)
7. Configure Atlassian MCP Server (enter `y`)
8. Provide JIRA instance URL (e.g., `https://stellaint.atlassian.net`)

**📖 [Detailed Installation Guide](docs/stella-user-guide.md#installation)**

## Documentation & Resources

### Essential Guides

- 📖 **[Stella User Guide](docs/stella-user-guide.md)** - Complete installation, workflow, and command reference
- 🚀 **[Quick Start Guide](docs/stella-user-guide.md#quick-start)** - Get started in minutes
- 🔧 **[Command Reference](docs/stella-user-guide.md#command-reference)** - All agent commands with detailed usage
- 💡 **[Best Practices](docs/stella-user-guide.md#best-practices)** - Tips for success with each agent
- 🐛 **[Troubleshooting](docs/stella-user-guide.md#troubleshooting)** - Common issues and solutions

### Understanding BMad-Stella

**Core Workflow Diagram:**

See the [complete Stella Development Workflow](docs/stella-user-guide.md#the-stella-development-workflow) with visual mermaid diagram showing the complete agent interaction flow.

**📖 [Full Command Reference](docs/stella-user-guide.md#command-reference)**

## Project Structure

### Core Directories

```
bmad-core/                      # Core agent system and workflows
├── agents/                     # Agent definitions (planner, dev, qa, reviewer)
├── tasks/                      # Reusable task definitions
├── templates/                  # Document templates
├── checklists/                 # Quality assurance checklists
└── data/                       # Knowledge base and preferences

tools/                          # Installation and build tools
├── installer/
│   ├── bin/
│   │   └── bmad.js             # Main installer CLI
│   ├── bmad-npx-wrapper    # NPX entry point
│   ├── ...
│   └── lib/                    # Installer modules
│       ├── dependency-manager.js
│       ├── config-generator.js
│       └── ...                 # Other installer utilities
```

### Extending BMad-Stella

**Adding New Agents or Skills:**

- Add agent definitions to `bmad-core/agents/`
- Create supporting tasks in `bmad-core/tasks/`
- Add templates to `bmad-core/templates/`
- Update `bmad-core/checklists/` for validation

**Customizing Installation:**

- Modify `tools/installer/bin/bmad.js` for CLI behavior
- Update `tools/installer/lib/` modules for installation logic
- Edit `tools/installer/lib/dependency-manager.js` for dependency handling
- Adjust `tools/installer/lib/config-generator.js` for configuration creation

**Key Files:**

- `tools/installer/bin/bmad-npx-wrapper` - NPX entry point for installation
- `tools/installer/bin/bmad.js` - Main installer command-line interface
- `tools/installer/lib/*.js` - Core installation functionality

## Support

- 📖 [Stella User Guide](docs/stella-user-guide.md) - Complete documentation
- 🐛 [Issue Tracker](https://github.com/Asrarul-BS23/BMad-Stella/issues) - Report bugs
- 💬 [BMad Community Discord](https://discord.gg/gk8jAdXWmj) - Get help and share ideas

## Contributing

Contributions are welcome! Whether it's bug fixes, new features, or documentation improvements.

**Contribution Guidelines:**

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes and test thoroughly
4. Commit with clear messages (`git commit -m 'feat: add amazing feature'`)
5. Push to your fork (`git push origin feature/amazing-feature`)
6. Open a Pull Request

**Please ensure:**

- Code follows existing patterns and conventions
- Documentation is updated for new features
- Changes are tested in Claude Code CLI

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

Built on the foundations of [BMAD-METHOD™](https://github.com/bmadcode/bmad-method) by BMad Code, LLC.

Special thanks to the BMad community for their continuous support and contributions.

---
