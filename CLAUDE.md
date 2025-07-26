# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an MCP (Model Context Protocol) server for knowledge retrieval using BM25 algorithm. The server provides document search and retrieval capabilities from organized knowledge domains.

### Core Architecture

The system follows a layered architecture with clear separation of concerns:

#### MCP Server Layer (`src/index.ts`)
- **Request Handling**: Processes MCP tool calls with async initialization guards
- **Process Management**: PID-based locking prevents duplicate server instances
- **Error Recovery**: Automatic server reinitialization on failures
- **Tool Registry**: Exposes 4 core tools for document interaction

#### Service Layer
- **DocumentRepository** (`src/services/DocumentRepository.ts`): Repository pattern with async initialization
  - Domain-specific and global BM25 calculators
  - Chunk-based search with context window support
  - Statistics and metadata management
- **DocumentLoader** (`src/services/DocumentLoader.ts`): Multi-source document ingestion
  - Local filesystem scanning with recursive directory support
  - Remote document loading via llms.txt protocol
  - Asynchronous batch processing

#### Processing Pipeline
1. **Document Ingestion**: Multi-format markdown loading (local/remote)
2. **Metadata Extraction**: AST-based title, description, and keyword extraction
3. **Chunking**: Header-based semantic chunking with configurable depth
4. **Indexing**: Domain-specific BM25 index construction
5. **Search**: Regex-pattern matching with relevance scoring

#### Data Layer
- **Document Model** (`src/models/Document.ts`): Immutable document representation
- **BM25 Calculator** (`src/utils/bm25.ts`): Statistical ranking with configurable parameters
- **Markdown Parser** (`src/utils/markdownParser.ts`): AST-based chunking and metadata extraction

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

### Configuration Files
The server uses a hierarchical configuration system with `config.json` as the primary source (see `config.example.json`).

```json
{
  "serverName": "knowledge-retrieval",
  "serverVersion": "1.0.0",
  "documentSource": {
    "type": "local",                    // "local" | "remote"
    "basePath": "./docs",              // Absolute or relative path
    "domains": [
      {
        "name": "company",              // Domain identifier
        "path": "company",              // Relative to basePath
        "category": "회사정보"           // Korean category name
      }
    ]
  },
  "bm25": {
    "k1": 1.2,                         // Term frequency saturation
    "b": 0.75                          // Document length normalization
  },
  "chunk": {
    "minWords": 30,                    // Minimum words per chunk
    "contextWindowSize": 1             // Context window for retrieval
  },
  "logLevel": "info"                   // "debug" | "info" | "warn" | "error"
}
```

### Environment Variables
All configuration options can be overridden via environment variables:

```bash
# Server Configuration
MCP_SERVER_NAME="knowledge-retrieval"
MCP_SERVER_VERSION="1.0.0"

# Document Source
DOCS_SOURCE_TYPE="local"              # "local" | "remote"
DOCS_BASE_PATH="./docs"               # Path resolution with fallbacks

# BM25 Algorithm Parameters
BM25_K1="1.2"                         # Range: 1.0-2.0 (optimal: 1.2)
BM25_B="0.75"                         # Range: 0.0-1.0 (optimal: 0.75)

# Chunking Configuration
CHUNK_MIN_WORDS="30"                  # Minimum words per chunk
CONTEXT_WINDOW_SIZE="1"               # Context window size

# Logging
LOG_LEVEL="info"                      # Debug verbosity
```

### Path Resolution Strategy
The configuration system uses sophisticated path resolution:

1. **Absolute Paths**: Used directly if valid
2. **Relative Paths**: Resolved against current working directory
3. **Fallback Resolution**: Uses module directory as base if primary path fails
4. **Existence Validation**: Verifies directory accessibility during startup

### Domain Configuration
Each domain supports:
- **name**: Unique identifier for API calls
- **path**: Directory path relative to basePath
- **category**: Korean language category for organization
- **Default Domains**: Automatically configured if not specified

## Document Processing & Chunking

### Document Organization
Documents are organized in domains under the configured base path:
- **Domain Structure**: Each domain has a name, path, and category (Korean language support)
- **Source Types**: Supports both local files and remote sources via llms.txt protocol
- **File Support**: .md, .mdx, .markdown files with recursive directory scanning

### Advanced Chunking Implementation

#### Header-Based Semantic Chunking
The system uses AST (Abstract Syntax Tree) parsing for intelligent document chunking:

```typescript
// src/utils/markdownParser.ts:12-62
// Uses unified + remark-parse for AST analysis
- Configurable header depth (default: maxDepth=2)
- Preserves document structure and context
- Handles documents without headers gracefully
```

#### Smart Chunk Merging
Small chunks are intelligently merged to maintain context:

```typescript
// Configuration in config.json
"chunk": {
  "minWords": 30,           // Minimum words per chunk
  "contextWindowSize": 1    // Context window for retrieval
}
```

**Merging Logic:**
1. Chunks below `minWords` threshold are buffered
2. Buffers are merged with subsequent chunks
3. Final buffers below `minWords/2` are merged with previous chunks
4. Preserves semantic boundaries while ensuring minimum content size

#### Context Window Retrieval
The system supports context-aware chunk retrieval:

```typescript
// src/models/Document.ts:58-71
getChunkWithWindow(chunkId: number, windowSize: number): DocumentChunk[]
```

- **Window Size**: Configurable number of surrounding chunks
- **Boundary Handling**: Respects document boundaries
- **Use Cases**: Search results with context, detailed content analysis

#### Metadata Extraction
Automatic metadata extraction from markdown content:

```typescript
// src/utils/markdownParser.ts:114-148
- Title: First H1 header (^# title)
- Description: First paragraph (non-header)
- Keywords: Extracted from code blocks (`keyword`)
```

## MCP Tools Available

### 1. `search-documents` - Advanced Document Search
**Description**: BM25-based document search using keyword arrays with regex pattern matching

**Parameters**:
```typescript
{
  keywords: string[];          // Required: Array of search terms
  domain?: string;            // Optional: Domain filter ("company", "customer", etc.)
  topN?: number;              // Optional: Max results (default: 10)
}
```

**Search Algorithm**:
- Converts keywords to regex patterns with special character escaping
- Uses domain-specific BM25 calculator if domain specified, otherwise global
- Scores results using BM25 algorithm with configurable k1/b parameters
- Returns results with context windows based on `contextWindowSize` config

**Example Response**:
```
## 문서: API Guide
* 문서 ID: 3
* 관련도 점수: 2.45

[chunk content with context]
```

### 2. `get-document-by-id` - Document Retrieval
**Description**: Retrieve complete document content by numeric ID

**Parameters**:
```typescript
{
  id: number;                 // Required: Document ID
}
```

**Returns**: Full markdown content with title formatting

### 3. `list-domains` - Domain Discovery
**Description**: List all available domains with document counts for exploration

**Parameters**: None

**Returns**:
```
## Available Domains

- company: 2 documents
- customer: 2 documents
- product: 2 documents
- technical: 2 documents
```

### 4. `get-chunk-with-context` - Context-Aware Chunk Retrieval
**Description**: Retrieve specific chunk with configurable surrounding context

**Parameters**:
```typescript
{
  documentId: number;         // Required: Document ID
  chunkId: number;           // Required: Chunk ID
  windowSize?: number;       // Optional: Context window size (default: 1)
}
```

**Context Window Logic**:
- Returns target chunk plus `windowSize` chunks before and after
- Respects document boundaries (no cross-document context)
- Useful for detailed analysis and content exploration

**Error Handling**: All tools include comprehensive error responses for missing documents/chunks

## Process Management

### Server Lifecycle
The MCP server includes sophisticated process management:

**PID-Based Locking** (`src/index.ts:26-79`):
- Prevents multiple server instances
- Automatic cleanup of stale PID files
- Graceful shutdown on SIGINT/SIGTERM

**Initialization Guards**:
- Async repository initialization with retry logic
- State validation before tool execution
- Automatic server recovery on failures

**Error Recovery**:
- Uncaught exception handling
- Process exit with appropriate error codes
- Detailed logging for debugging

### Deployment Considerations
- **Memory Usage**: Scales with document corpus size
- **Startup Time**: Depends on document loading and BM25 indexing
- **Concurrency**: Single-instance design for data consistency
- **Resource Cleanup**: Automatic PID file management

## Korean Language Support

The system includes comprehensive Korean language support:

### Domain Categories
- **회사정보** (Company Information)
- **고객서비스** (Customer Service)
- **제품정보** (Product Information)
- **기술문서** (Technical Documentation)

### Korean Text Processing
- Full Unicode support for Korean characters
- Proper word boundary detection for Korean text
- Metadata extraction supports Korean titles and descriptions
- Search results formatted in Korean with relevant context

### Configuration
Korean categories are defined in domain configuration and default settings (`src/config/config.ts:15-20`).

## Testing and Quality

- TypeScript with strict mode enabled
- ESLint configuration for code quality
- Jest for testing framework
- All code includes Korean comments for documentation
- Comprehensive error handling and logging
- Type-safe configuration management