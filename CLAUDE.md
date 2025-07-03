# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an MCP (Model Context Protocol) server for knowledge retrieval using BM25 algorithm. The server provides document search and retrieval capabilities from organized knowledge domains.

### Core Architecture

- **MCP Server**: Built on `@modelcontextprotocol/sdk`, provides tools for document search and retrieval
- **Document Processing**: Markdown documents are chunked and indexed using BM25 algorithm
- **Domain Organization**: Documents are organized by domains (company, customer, product, technical)
- **Search Engine**: BM25-based semantic search with configurable parameters

### Key Components

- `src/index.ts`: Main MCP server entry point with tool handlers
- `src/services/DocumentRepository.ts`: Core search and document management using BM25
- `src/services/DocumentLoader.ts`: Document loading from local/remote sources with auto-discovery
- `src/services/DomainDiscovery.ts`: Auto-discovery service for folder-based domain registration
- `src/models/Document.ts`: Document and chunk data structures
- `src/utils/bm25.ts`: BM25 algorithm implementation
- `src/config/config.ts`: Configuration management with environment variable support

## Development Commands

```bash
# Build the project
npm run build

# Start production server
npm start

# Development mode with hot reload
npm run dev

# Run tests
npm test

# Lint code
npm run lint
```

## Configuration

The server uses `config.json` for configuration (see `config.example.json`). Key settings:
- Document source paths and domains
- BM25 parameters (k1, b)
- Chunk settings (minWords, contextWindowSize)

Environment variables can override config file settings (see `src/config/config.ts:26-42`).

## Document Structure

Documents are organized in domains under the configured base path:
- **Auto-Discovery**: Automatically detects any folder in `docs/` as a domain
- **Hierarchical Support**: Supports nested domains (e.g., `docs/company/hr/` becomes `company.hr`)
- **Hybrid Configuration**: Combines static config.json domains with auto-discovered domains
- **Metadata Support**: Optional `.domain.json` files for custom domain metadata
- **Flexible Organization**: Supports both flat and nested folder structures
- Documents are automatically chunked for optimal search performance

### Zero-Configuration Knowledge Addition

**Simple Workflow**: Just create folders and add markdown files!

```bash
# Add new knowledge domain
mkdir docs/faq
echo "# FAQ\n\nQ: How to use?\nA: Just add markdown files!" > docs/faq/general.md

# Add nested domain
mkdir -p docs/company/finance
echo "# Budget Guidelines\n\nAnnual budget process..." > docs/company/finance/budget.md

# Add any folder name - automatically categorized
mkdir docs/tutorials
echo "# Getting Started\n\nStep 1: ..." > docs/tutorials/quickstart.md
```

**Auto-Discovery Features**:

1. **Zero Configuration**: No config.json editing required
2. **Smart Categories**: Automatic Korean category generation
   - `faq` → `FAQ`
   - `tutorials` → `튜토리얼`
   - `news` → `뉴스`
   - `manual` → `사용설명서`
   - `unknown-folder` → `unknown-folder 문서`
3. **Nested Domains**: `docs/company/hr/` → domain: `company.hr`
4. **Instant Availability**: New folders immediately available for search

### Advanced Configuration (Optional)

**Custom Categories** via `.domain.json` (completely optional):
```json
{
  "category": "사용설명서",
  "description": "제품 및 서비스 사용 설명서", 
  "enabled": true
}
```

**Manual Domains** via `config.json` (legacy support):
```json
{
  "documentSource": {
    "basePath": "./docs",
    "autoDiscovery": true,
    "domains": []
  }
}
```

## MCP Tools Available

1. `search-documents`: BM25-based document search with keyword arrays
2. `get-document-by-id`: Retrieve full document by ID
3. `list-domains`: Get available domains and document counts
4. `get-chunk-with-context`: Get specific chunks with surrounding context

## Testing and Quality

- TypeScript with strict mode enabled
- ESLint configuration for code quality
- Jest for testing framework
- All code includes Korean comments for documentation