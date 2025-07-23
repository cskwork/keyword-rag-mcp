# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an advanced MCP (Model Context Protocol) server for knowledge retrieval with **LLM-based auto-classification** and dynamic domain generation. The server automatically organizes documents into intelligent domains and provides powerful search capabilities.

### Core Architecture

- **MCP Server**: Built on `@modelcontextprotocol/sdk`, provides tools for document search and retrieval
- **Auto-Classification**: LLM-powered document analysis that generates and assigns domains automatically
- **Domain Persistence**: Generated domain names stay fixed once created, stored in `.domain-data.json`
- **Document Processing**: Markdown documents are chunked and indexed using BM25 algorithm
- **Dynamic Organization**: Documents are automatically organized by LLM-generated domains
- **Search Engine**: BM25-based semantic search with domain-aware capabilities

### Key Features

- **🤖 LLM Auto-Classification**: Documents are automatically analyzed and assigned to appropriate domains
- **📂 Dynamic Domain Generation**: Domains are created on-demand based on document content
- **🔒 Fixed Domain Names**: Once generated, domain names remain consistent across sessions
- **🔍 Intelligent Search**: Search within specific auto-generated domains or across all documents
- **⚙️ Simplified Configuration**: Pure `.env` configuration - no complex JSON files

### Key Components

- `src/index.ts`: Main MCP server entry point with enhanced auto-classification tools
- `src/services/DomainManager.ts`: Manages LLM-generated domains and document mappings
- `src/services/LLMClassificationService.ts`: Intelligent document classification and domain generation
- `src/services/DocumentLoader.ts`: Auto-classifying document loader with domain integration
- `src/services/DocumentRepository.ts`: Core search and document management using BM25
- `src/models/Document.ts`: Document and chunk data structures
- `src/utils/bm25.ts`: BM25 algorithm implementation
- `src/config/config.ts`: Simplified environment-based configuration

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

The server uses **only `.env` file** for configuration (see `.env.example`). Key settings:
- Document source path (`DOCS_BASE_PATH`)
- BM25 parameters (`BM25_K1`, `BM25_B`)
- Chunk settings (`CHUNK_MIN_WORDS`, `CONTEXT_WINDOW_SIZE`)
- Classification settings (`CLASSIFICATION_ENABLED`, `AUTO_CLASSIFY_NEW_DOCS`)

**No more config.json complexity!** All configuration is now environment-based.

## Auto-Classification System

### How It Works

1. **Document Scanning**: Automatically scans all files in the `docs/` folder
2. **Content Analysis**: Analyzes document structure, keywords, and content type
3. **Domain Generation**: Creates meaningful domain names (e.g., "technical", "customer-support", "api")
4. **Persistent Mapping**: Stores document-to-domain mappings in `.domain-data.json`
5. **Fixed Domains**: Once created, domain names stay consistent across restarts

### Domain Types

The system automatically detects and creates domains for:
- **Technical**: API docs, code guides, implementation details
- **Customer Support**: FAQs, troubleshooting, help guides  
- **Business**: Company policies, processes, organizational info
- **Product**: Feature guides, tutorials, specifications
- **Policy**: Terms, agreements, compliance documents

### Domain Persistence

- **Location**: `.domain-data.json` in project root
- **Automatic**: Created and managed automatically
- **Versioned**: Includes version and timestamp information
- **Fixed Names**: Domain names never change once generated

## MCP Tools Available

### Core Search Tools
1. `search-documents`: BM25-based search with auto-classified domain filtering
2. `get-document-by-id`: Retrieve full document by ID

### Domain Management Tools  
3. `list-domains`: List all auto-generated domains with detailed information
4. `get-domain-info`: Get comprehensive details about a specific domain
5. `get-chunk-with-context`: Get specific chunks with surrounding context

### Enhanced Features
- **Domain Filtering**: Search within specific auto-generated domains
- **Rich Domain Info**: See domain descriptions, keywords, creation dates
- **Document Mapping**: View which documents belong to each domain
- **Confidence Scores**: See classification confidence for each document

## Document Structure

Documents are automatically organized:
- **Source**: All markdown files in `docs/` folder (recursively scanned)
- **Classification**: Each document automatically assigned to appropriate domain
- **Persistence**: Domain assignments stored and maintained across sessions
- **Chunking**: Documents automatically chunked for optimal search performance

## Testing and Quality

- TypeScript with strict mode enabled
- ESLint configuration for code quality
- Jest for testing framework
- Comprehensive error handling and logging
- Auto-recovery and graceful degradation