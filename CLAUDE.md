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
- `src/services/DocumentLoader.ts`: Document loading from local/remote sources
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
- Each domain has a name, path, and category
- Supports both local files and remote sources (via llms.txt)
- Documents are automatically chunked for optimal search performance

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