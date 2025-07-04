# Example Usage of Cypher Query Assistant

This document shows practical examples of how to use the Cypher Query Assistant MCP server.

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

**User Question**: "Show me all users who have admin privileges"

**Command**: Use the `find_similar_queries` tool with the question.

**Expected Response**:
```
Found 1 similar examples for: "Show me all users who have admin privileges"

Example 1 (similarity: 0.756):
Question: How many users are in the system?
Cypher: MATCH (u:User) RETURN count(u) as user_count
Domain: user_management
Complexity: simple
```

**Generated Query** (based on the example):
```cypher
MATCH (u:User) WHERE u.role = 'admin' RETURN u
```

## Example 2: Adding Training Data

**Command**: Use the `add_training_example` tool to add a new example.

**Parameters**:
- Question: "Find all orders placed today"
- Cypher Query: "MATCH (o:Order) WHERE date(o.created_at) = date() RETURN o"
- Metadata: `{"domain": "order_management", "complexity": "simple", "tags": ["date", "filter"]}`

**Expected Response**:
```
Successfully added training example with ID: example_1704285600000_abc123def
Question: Find all orders placed today
Cypher: MATCH (o:Order) WHERE date(o.created_at) = date() RETURN o
```

## Example 3: Complex Query Assistance

**User Question**: "Find customers who bought products from multiple categories"

**Command**: Use `find_similar_queries` tool.

**Expected Response**:
```
Found 2 similar examples for: "Find customers who bought products from multiple categories"

Example 1 (similarity: 0.823):
Question: Get user recommendations based on similar users' purchases
Cypher: MATCH (u:User {id: $userId})-[:PURCHASED]->(p:Product)<-[:PURCHASED]-(similar:User)-[:PURCHASED]->(rec:Product) WHERE NOT (u)-[:PURCHASED]->(rec) RETURN rec, count(*) as score ORDER BY score DESC LIMIT 5
Domain: recommendations
Complexity: complex

Example 2 (similarity: 0.789):
Question: Find the most popular products by purchase count
Cypher: MATCH (p:Product)<-[:CONTAINS]-(o:Order) RETURN p.name, count(o) as purchase_count ORDER BY purchase_count DESC LIMIT 10
Domain: analytics
Complexity: medium
```

**Generated Query** (based on examples):
```cypher
MATCH (c:Customer)-[:PURCHASED]->(p:Product)-[:BELONGS_TO]->(cat:Category)
WITH c, collect(DISTINCT cat.name) as categories
WHERE size(categories) > 1
RETURN c, categories, size(categories) as category_count
ORDER BY category_count DESC
```

## Example 4: Domain-Specific Queries

**Adding E-commerce Examples**:

1. **Product Search**:
   ```
   Question: "Find products with ratings above 4 stars"
   Cypher: "MATCH (p:Product) WHERE p.rating > 4.0 RETURN p ORDER BY p.rating DESC"
   Metadata: {"domain": "product_search", "complexity": "simple"}
   ```

2. **Customer Analytics**:
   ```
   Question: "Find customers who spent more than $1000 total"
   Cypher: "MATCH (c:Customer)-[:PLACED]->(o:Order) WITH c, sum(o.total) as total_spent WHERE total_spent > 1000 RETURN c, total_spent ORDER BY total_spent DESC"
   Metadata: {"domain": "customer_analytics", "complexity": "medium"}
   ```

3. **Inventory Management**:
   ```
   Question: "Show products that are out of stock"
   Cypher: "MATCH (p:Product) WHERE p.stock_quantity = 0 RETURN p"
   Metadata: {"domain": "inventory", "complexity": "simple"}
   ```

## Example 5: Using Metadata Filters

**Command**: Use `list_training_examples` with domain filter.

**Parameters**:
- limit: 5
- domain: "user_management"

**Expected Response**:
```
Training Examples (showing 1 of 5 total):

1. ID: example_1704285600000_xyz789
   Question: How many users are in the system?
   Cypher: MATCH (u:User) RETURN count(u) as user_count
   Domain: user_management
   Complexity: simple
   Created: 2025-01-03T10:00:00.000Z
```

## Best Practices

1. **Start with Simple Examples**: Add basic patterns first, then build complexity
2. **Use Descriptive Metadata**: Include domain, complexity, and relevant tags
3. **Test Similarity**: Try different phrasings of questions to test matching
4. **Iterative Improvement**: Add examples based on queries you frequently need
5. **Domain Organization**: Group related examples by domain for better organization

## Common Use Cases

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
