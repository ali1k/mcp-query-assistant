# Query Assistant MCP Server

A Model Context Protocol (MCP) server that helps generate queries using semantic search over training examples. This server provides few-shot learning capabilities by finding similar questions and their corresponding queries to guide query generation for various query languages (Cypher, SPARQL, SQL, etc.).

## Features

- **Semantic Search**: Uses OpenAI embeddings to find similar questions in your training dataset
- **Few-Shot Learning**: Returns relevant examples to help generate accurate queries
- **Training Data Management**: Add, list, and manage question-query pairs with duplicate detection
- **Vector Storage**: Efficient similarity search using HNSW (Hierarchical Navigable Small World) algorithm
- **Metadata Support**: Organize examples by domain, complexity, and tags
- **Multi-Language Support**: Works with various query languages (Cypher, SPARQL, SQL, etc.)

## Installation

1. **Prerequisites**: Node.js 18+ and npm

2. **Build the server**:
   ```bash
   cd /Users/alkhalili/Documents/Cline/MCP/mcp-query-assistant
   npm install
   npm run build
   ```

3. **Configure OpenAI API Key**:
   - Get your API key from [OpenAI Platform](https://platform.openai.com/api-keys)
   - Update the MCP settings file at:
     `/Users/alkhalili/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
   - Replace `your_openai_api_key_here` with your actual API key

4. **Server Configuration**: The server is already configured in your MCP settings as:
   ```json
   "query-assistant": {
     "command": "node",
     "args": ["/Users/alkhalili/Documents/Cline/MCP/mcp-query-assistant/build/index.js"],
     "env": {
       "OPENAI_API_KEY": "your_openai_api_key_here"
     },
     "disabled": false,
     "autoApprove": []
   }
   ```

## Available Tools

### 1. `find_similar_queries`
Find similar query examples based on a natural language question.

**Parameters:**
- `question` (required): The natural language question to find similar examples for
- `limit` (optional): Maximum number of similar examples to return (default: 3, max: 10)
- `threshold` (optional): Minimum similarity threshold 0-1 (default: 0.7)

**Example Usage:**
```
Use the find_similar_queries tool to find examples for: "Give me the list of CDEs in the lineage"
```

### 2. `add_training_example`
Add a new question-query pair to the training dataset.

**Parameters:**
- `question` (required): The natural language question
- `query` (required): The corresponding query (Cypher, SPARQL, SQL, etc.)
- `metadata` (optional): Additional metadata (domain, complexity, tags)

**Example Usage:**
```
Add a training example:
Question: "Find users who bought expensive products"
Query: "MATCH (u:User)-[:PURCHASED]->(p:Product) WHERE p.price > 1000 RETURN u"
Metadata: {"domain": "user_analytics", "complexity": "medium"}
```

### 3. `list_training_examples`
List all training examples in the dataset.

**Parameters:**
- `limit` (optional): Maximum number of examples to return (default: 10, max: 100)
- `domain` (optional): Filter by domain

### 4. `find_duplicates`
Find duplicate training examples based on question and query.

**Parameters:** None

**Example Usage:**
```
Use find_duplicates to identify duplicate training examples in your dataset.
```

### 5. `remove_duplicates`
Remove duplicate training examples, keeping only the first occurrence of each unique question-query pair.

**Parameters:**
- `confirm` (optional): Set to true to confirm removal of duplicates (default: false)

**Example Usage:**
```
Use remove_duplicates with confirm=true to clean up duplicate examples.
```

## Default Training Examples

The server comes with 1 default example covering data lineage patterns:

1. **Data Lineage**: "Give me the list of CDEs in the lineage"
   - Query: `MATCH (cde:CDE) RETURN cde.name, cde.description, cde.layer, cde.fqn ORDER BY cde.name`
   - Domain: Data Lineage
   - Complexity: simple

## Usage Workflow

1. **Ask for similar queries**: When you need to write a query, use `find_similar_queries` with your natural language question
2. **Get few-shot examples**: The server returns similar questions and their queries with similarity scores
3. **Generate your query**: Use the examples as guidance to write your specific query
4. **Add new examples**: Use `add_training_example` to expand your training dataset with new patterns
5. **Manage duplicates**: Use `find_duplicates` and `remove_duplicates` to keep your dataset clean

## Data Storage

- **Training Data**: Stored in `data/training_data.json`
- **Vector Index**: Stored in `data/vector_index.bin`
- **Embeddings**: Generated using OpenAI's `text-embedding-3-small` model (1536 dimensions)

## Example Interaction

```
User: "Show me all data elements with their descriptions"

Agent: Let me find similar examples for you.
[Uses find_similar_queries tool]

Server Response:
Found 1 similar examples for: "Show me all data elements with their descriptions"

Example 1 (similarity: 0.823):
Question: Give me the list of CDEs in the lineage
Query: MATCH (cde:CDE) RETURN cde.name, cde.description, cde.layer, cde.fqn ORDER BY cde.name
Domain: Data Lineage
Complexity: simple

Agent: Based on this example, here's a query for showing data elements with descriptions:
MATCH (cde:CDE) 
RETURN cde.name, cde.description 
ORDER BY cde.name
```

## Troubleshooting

1. **"OpenAI API key not configured"**: Make sure you've set your API key in the MCP settings
2. **"No similar examples found"**: Try lowering the similarity threshold or adding more training data
3. **Server not connecting**: Check that the build path is correct and the server compiled successfully

## Contributing

To add more training examples or improve the server:

1. Use the `add_training_example` tool to add new question-query pairs
2. Organize examples with appropriate metadata (domain, complexity, tags)
3. Test similarity search with various question phrasings
4. Consider adding domain-specific examples for your use case

## Technical Details

- **Vector Database**: HNSW (Hierarchical Navigable Small World) for efficient similarity search
- **Embedding Model**: OpenAI text-embedding-3-small (1536 dimensions)
- **Similarity Metric**: Cosine similarity
- **Storage Format**: JSON for training data, binary for vector index
- **Max Capacity**: 10,000 training examples (configurable)
