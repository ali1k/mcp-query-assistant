# Example Usage of Query Assistant

This document shows practical examples of how to use the Query Assistant MCP server.

## Prerequisites

1. Make sure you have an OpenAI API key available
2. You can provide the API key in two ways:
   - **Command line argument** (recommended): `--openai-key your-api-key-here`
   - **Environment variable**: Set `OPENAI_API_KEY=your-api-key-here`
3. The server should appear in your "Connected MCP Servers" section

## Starting the Server

### Method 1: Command Line Argument (Recommended)
```bash
node build/index.js --openai-key sk-your-openai-api-key-here
```

### Method 2: Environment Variable
```bash
OPENAI_API_KEY=sk-your-openai-api-key-here node build/index.js
```

### Method 3: Using npm scripts
You can also update your `package.json` to include the API key:
```json
{
  "scripts": {
    "start": "node build/index.js --openai-key sk-your-openai-api-key-here"
  }
}
```

## Example 1: Finding Similar Queries

**User Question**: "Show me all data elements in the system"

**Command**: Use the `find_similar_queries` tool with the question.

**Expected Response**:
```
Found 1 similar examples for: "Show me all data elements in the system"

Example 1 (similarity: 0.856):
Question: Give me the list of CDEs in the lineage
Query: MATCH (cde:CDE) RETURN cde.name, cde.description, cde.layer, cde.fqn ORDER BY cde.name
Domain: Data Lineage
Complexity: simple
```

**Generated Query** (based on the example):
```cypher
MATCH (cde:CDE) RETURN cde.name, cde.description ORDER BY cde.name
```

## Example 2: Adding Training Data

**Command**: Use the `add_training_example` tool to add a new example.

**Parameters**:
- Question: "Find all orders placed today"
- Query: "MATCH (o:Order) WHERE date(o.created_at) = date() RETURN o"
- Metadata: `{"domain": "order_management", "complexity": "simple", "tags": ["date", "filter"]}`

**Expected Response**:
```
Successfully added training example with ID: example_1704285600000_abc123def
Question: Find all orders placed today
Query: MATCH (o:Order) WHERE date(o.created_at) = date() RETURN o
```

## Example 3: Complex Query Assistance

**User Question**: "Find data elements that are related to multiple layers"

**Command**: Use `find_similar_queries` tool.

**Expected Response**:
```
Found 1 similar examples for: "Find data elements that are related to multiple layers"

Example 1 (similarity: 0.734):
Question: Give me the list of CDEs in the lineage
Query: MATCH (cde:CDE) RETURN cde.name, cde.description, cde.layer, cde.fqn ORDER BY cde.name
Domain: Data Lineage
Complexity: simple
```

**Generated Query** (based on examples):
```cypher
MATCH (cde:CDE)-[:RELATED_TO]-(other:CDE)
WHERE cde.layer <> other.layer
WITH cde, collect(DISTINCT other.layer) as related_layers
WHERE size(related_layers) > 1
RETURN cde.name, cde.layer, related_layers, size(related_layers) as layer_count
ORDER BY layer_count DESC
```

## Example 4: Domain-Specific Queries

**Adding Data Lineage Examples**:

1. **Data Element Search**:
   ```
   Question: "Find data elements in the bronze layer"
   Query: "MATCH (cde:CDE) WHERE cde.layer = 'bronze' RETURN cde.name, cde.description ORDER BY cde.name"
   Metadata: {"domain": "data_lineage", "complexity": "simple"}
   ```

2. **Data Quality Analysis**:
   ```
   Question: "Find data elements with quality issues"
   Query: "MATCH (cde:CDE)-[:HAS_ISSUE]->(issue:QualityIssue) RETURN cde.name, collect(issue.type) as issues ORDER BY size(issues) DESC"
   Metadata: {"domain": "data_quality", "complexity": "medium"}
   ```

3. **Lineage Tracing**:
   ```
   Question: "Show the full lineage path for a data element"
   Query: "MATCH path = (source:CDE)-[:DERIVES_FROM*]->(target:CDE {name: $elementName}) RETURN path"
   Metadata: {"domain": "data_lineage", "complexity": "complex"}
   ```

## Example 5: Using Metadata Filters

**Command**: Use `list_training_examples` with domain filter.

**Parameters**:
- limit: 5
- domain: "Data Lineage"

**Expected Response**:
```
Training Examples (showing 1 of 1 total):

1. ID: example_1704285600000_xyz789
   Question: Give me the list of CDEs in the lineage
   Query: MATCH (cde:CDE) RETURN cde.name, cde.description, cde.layer, cde.fqn ORDER BY cde.name
   Domain: Data Lineage
   Complexity: simple
   Created: 2025-01-03T10:00:00.000Z
```

## Example 6: Managing Duplicates

**Finding Duplicates**:

**Command**: Use `find_duplicates` tool.

**Expected Response**:
```
Found 2 duplicate groups with 3 duplicate entries:

Duplicate Group 1:
   Question: "Find all data elements"
   Query: "MATCH (cde:CDE) RETURN cde"
   Examples:
   [KEEP] ID: example_1704285600000_abc123
      Created: 2025-01-03T10:00:00.000Z
   [DUPLICATE] ID: example_1704285700000_def456
      Created: 2025-01-03T10:05:00.000Z
   [DUPLICATE] ID: example_1704285800000_ghi789
      Created: 2025-01-03T10:10:00.000Z

Use 'remove_duplicates' tool with confirm=true to remove duplicates.
```

**Removing Duplicates**:

**Command**: Use `remove_duplicates` tool with confirm=true.

**Expected Response**:
```
Successfully removed 3 duplicate examples.
Original count: 10
New count: 7
Removed IDs: example_1704285700000_def456, example_1704285800000_ghi789, example_1704285900000_jkl012
```

## Best Practices

1. **Start with Simple Examples**: Add basic patterns first, then build complexity
2. **Use Descriptive Metadata**: Include domain, complexity, and relevant tags
3. **Test Similarity**: Try different phrasings of questions to test matching
4. **Iterative Improvement**: Add examples based on queries you frequently need
5. **Domain Organization**: Group related examples by domain for better organization

## Common Use Cases

### Data Lineage & Governance
- Data element discovery and cataloging
- Lineage tracing and impact analysis
- Data quality monitoring
- Compliance and audit queries

### Graph Analytics
- Node counting queries
- Relationship traversal patterns
- Aggregation queries
- Path finding queries

### Business Intelligence
- Customer segmentation
- Product performance analysis
- Sales trend analysis
- User behavior patterns

### Data Management
- CRUD operations
- Data validation queries
- Cleanup and maintenance
- Schema exploration

## Tips for Better Results

1. **Lower Threshold**: If no examples are found, try reducing the similarity threshold to 0.5 or 0.6
2. **Add Variations**: Include different ways to ask the same question
3. **Include Edge Cases**: Add examples for complex scenarios and edge cases
4. **Regular Updates**: Keep adding new patterns as your use cases evolve
5. **Test Frequently**: Regularly test the similarity search with new questions
