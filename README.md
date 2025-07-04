# Cypher Query Assistant MCP Server

A Model Context Protocol (MCP) server that helps generate Cypher queries using semantic search over training examples. This server provides few-shot learning capabilities by finding similar questions and their corresponding Cypher queries to guide query generation.

## Features

- **Semantic Search**: Uses OpenAI embeddings to find similar questions in your training dataset
- **Few-Shot Learning**: Returns relevant examples to help generate accurate Cypher queries
- **Training Data Management**: Add, list, and manage question-Cypher query pairs
- **Vector Storage**: Efficient similarity search using HNSW (Hierarchical Navigable Small World) algorithm
- **Metadata Support**: Organize examples by domain, complexity, and tags

## Installation

1. **Prerequisites**: Node.js 18+ and npm

2. **Build the server**:
   ```bash
   cd /Users/alkhalili/Documents/Cline/MCP/cypher-query-assistant
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
   "cypher-query-assistant": {
     "command": "node",
     "args": ["/Users/alkhalili/Documents/Cline/MCP/cypher-query-assistant/build/index.js"],
     "env": {
       "OPENAI_API_KEY": "your_openai_api_key_here"
     },
     "disabled": false,
     "autoApprove": []
   }
   ```

## Available Tools

### 1. `find_similar_queries`
Find similar Cypher query examples based on a natural language question.

**Parameters:**
- `question` (required): The natural language question to find similar examples for
- `limit` (optional): Maximum number of similar examples to return (default: 3, max: 10)
- `threshold` (optional): Minimum similarity threshold 0-1 (default: 0.7)

**Example Usage:**
```
Use the find_similar_queries tool to find examples for: "How many products are there?"
```

### 2. `add_training_example`
Add a new question-Cypher query pair to the training dataset.

**Parameters:**
- `question` (required): The natural language question
- `cypher_query` (required): The corresponding Cypher query
- `metadata` (optional): Additional metadata (domain, complexity, tags)

**Example Usage:**
```
Add a training example:
Question: "Find users who bought expensive products"
Cypher: "MATCH (u:User)-[:PURCHASED]->(p:Product) WHERE p.price > 1000 RETURN u"
Metadata: {"domain": "user_analytics", "complexity": "medium"}
```

### 3. `list_training_examples`
List all training examples in the dataset.

**Parameters:**
- `limit` (optional): Maximum number of examples to return (default: 10, max: 100)
- `domain` (optional): Filter by domain

## Default Training Examples

The server comes with 5 default examples covering common Neo4j patterns:

1. **User Management**: "How many users are in the system?"
2. **Product Catalog**: "Find all products with high ratings"
3. **User Activity**: "Show users who have made purchases in the last month"
4. **Analytics**: "Find the most popular products by purchase count"
5. **Recommendations**: "Get user recommendations based on similar users' purchases"

## Usage Workflow

1. **Ask for similar queries**: When you need to write a Cypher query, use `find_similar_queries` with your natural language question
2. **Get few-shot examples**: The server returns similar questions and their Cypher queries with similarity scores
3. **Generate your query**: Use the examples as guidance to write your specific Cypher query
4. **Add new examples**: Use `add_training_example` to expand your training dataset with new patterns

## Data Storage

- **Training Data**: Stored in `data/training_data.json`
- **Vector Index**: Stored in `data/vector_index.bin`
- **Embeddings**: Generated using OpenAI's `text-embedding-3-small` model (1536 dimensions)

## Example Interaction

```
User: "I need to find all customers who made orders last week"

Agent: Let me find similar examples for you.
[Uses find_similar_queries tool]

Server Response:
Found 2 similar examples for: "I need to find all customers who made orders last week"

Example 1 (similarity: 0.847):
Question: Show users who have made purchases in the last month
Cypher: MATCH (u:User)-[:PURCHASED]->(o:Order) WHERE o.date > date() - duration('P30D') RETURN DISTINCT u
Domain: user_activity
Complexity: medium

Example 2 (similarity: 0.782):
Question: Find the most popular products by purchase count
Cypher: MATCH (p:Product)<-[:CONTAINS]-(o:Order) RETURN p.name, count(o) as purchase_count ORDER BY purchase_count DESC LIMIT 10
Domain: analytics
Complexity: medium

Agent: Based on these examples, here's a Cypher query for finding customers who made orders last week:
MATCH (c:Customer)-[:PLACED]->(o:Order) 
WHERE o.date > date() - duration('P7D') 
RETURN DISTINCT c
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
