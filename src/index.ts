#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import OpenAI from 'openai';
import pkg from 'hnswlib-node';
const { HierarchicalNSW } = pkg;
import fs from 'fs-extra';

// Type for HierarchicalNSW
type HierarchicalNSWType = InstanceType<typeof HierarchicalNSW>;
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
function parseArguments(): { openaiKey?: string; dataDir?: string } {
  const args = process.argv.slice(2);
  const result: { openaiKey?: string; dataDir?: string } = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--openai-key' && i + 1 < args.length) {
      result.openaiKey = args[i + 1];
      i++; // Skip the next argument as it's the value
    } else if (args[i] === '--data-dir' && i + 1 < args.length) {
      result.dataDir = args[i + 1];
      i++; // Skip the next argument as it's the value
    }
  }
  
  return result;
}

// Get OpenAI API key from command line arguments or environment variable
const cliArgs = parseArguments();
const OPENAI_API_KEY = cliArgs.openaiKey || process.env.OPENAI_API_KEY;
const DATA_DIR = cliArgs.dataDir || process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const VECTOR_INDEX_PATH = path.join(DATA_DIR, 'vector_index.bin');
const TRAINING_DATA_PATH = path.join(DATA_DIR, 'training_data.json');
const EMBEDDING_DIMENSION = 1536; // OpenAI text-embedding-3-small dimension
const MAX_ELEMENTS = 10000;

interface TrainingExample {
  id: string;
  question: string;
  query: string;
  metadata?: {
    domain?: string;
    complexity?: string;
    created_at?: string;
    tags?: string[];
  };
}

interface SimilarExample {
  example: TrainingExample;
  similarity: number;
}

const isValidFindSimilarArgs = (
  args: any
): args is { question: string; limit?: number; threshold?: number } =>
  typeof args === 'object' &&
  args !== null &&
  typeof args.question === 'string' &&
  (args.limit === undefined || typeof args.limit === 'number') &&
  (args.threshold === undefined || typeof args.threshold === 'number');

const isValidAddExampleArgs = (
  args: any
): args is { question: string; query: string; metadata?: any } =>
  typeof args === 'object' &&
  args !== null &&
  typeof args.question === 'string' &&
  typeof args.query === 'string';

class queryAssistant {
  private server: Server;
  private openai: OpenAI | null = null;
  private vectorIndex: HierarchicalNSWType | null = null;
  private trainingData: TrainingExample[] = [];
  private idToIndex: Map<string, number> = new Map();

  constructor() {
    this.server = new Server(
      {
        name: 'query-assistant',
        version: '0.1.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    // Initialize OpenAI client if API key is provided
    if (OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: OPENAI_API_KEY,
      });
    }

    this.setupToolHandlers();
    this.setupResourceHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private async initializeVectorStore() {
    // Ensure data directory exists
    await fs.ensureDir(DATA_DIR);

    // Load existing training data
    if (await fs.pathExists(TRAINING_DATA_PATH)) {
      try {
        const data = await fs.readJson(TRAINING_DATA_PATH);
        this.trainingData = Array.isArray(data) ? data : [];
      } catch (error) {
        console.error('Error loading training data:', error);
        this.trainingData = [];
      }
    }

    // Initialize vector index
    this.vectorIndex = new HierarchicalNSW('cosine', EMBEDDING_DIMENSION);
    this.vectorIndex.initIndex(MAX_ELEMENTS);

    // Load existing vector index if it exists
    if (await fs.pathExists(VECTOR_INDEX_PATH) && this.trainingData.length > 0) {
      try {
        this.vectorIndex.readIndex(VECTOR_INDEX_PATH);
        // Rebuild ID to index mapping
        this.trainingData.forEach((example, index) => {
          this.idToIndex.set(example.id, index);
        });
        console.log(`Loaded ${this.trainingData.length} training examples`);
      } catch (error) {
        console.error('Error loading vector index:', error);
        // Reinitialize if loading fails
        this.vectorIndex = new HierarchicalNSW('cosine', EMBEDDING_DIMENSION);
        this.vectorIndex.initIndex(MAX_ELEMENTS);
      }
    }

    // Add some default examples if no training data exists
    if (this.trainingData.length === 0) {
      await this.addDefaultExamples();
    }
  }

  private async addDefaultExamples() {
    const defaultExamples: Omit<TrainingExample, 'id'>[] = [
      {
        question: "Give me the list of CDEs in the lineage",
        query: "MATCH (cde:CDE) RETURN cde.name, cde.description, cde.layer, cde.fqn ORDER BY cde.name",
        metadata: { domain: "Data Lineage", complexity: "simple" }
      }
    ];

    for (const example of defaultExamples) {
      await this.addTrainingExample(example.question, example.query, example.metadata);
    }
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    if (!this.openai) {
      throw new McpError(
        ErrorCode.InternalError,
        'OpenAI API key not configured. Please provide it via --openai-key argument or set OPENAI_API_KEY environment variable.'
      );
    }

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async addTrainingExample(question: string, query: string, metadata?: any): Promise<string> {
    // Check for duplicates based on question and query
    const existingExample = this.trainingData.find(
      example => 
        example.question.toLowerCase().trim() === question.toLowerCase().trim() &&
        example.query.toLowerCase().trim() === query.toLowerCase().trim()
    );

    if (existingExample) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Duplicate training example found. Existing example ID: ${existingExample.id}`
      );
    }

    const id = `example_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const example: TrainingExample = {
      id,
      question,
      query: query,
      metadata: {
        ...metadata,
        created_at: new Date().toISOString(),
      },
    };

    // Generate embedding
    const embedding = await this.generateEmbedding(question);

    // Add to vector index
    const index = this.trainingData.length;
    this.vectorIndex!.addPoint(embedding, index);
    this.idToIndex.set(id, index);

    // Add to training data
    this.trainingData.push(example);

    // Save data
    await this.saveData();

    return id;
  }

  private async saveData() {
    // Save training data
    await fs.writeJson(TRAINING_DATA_PATH, this.trainingData, { spaces: 2 });

    // Save vector index
    if (this.vectorIndex && this.trainingData.length > 0) {
      this.vectorIndex.writeIndex(VECTOR_INDEX_PATH);
    }
  }

  private async findSimilarExamples(question: string, limit: number = 3, threshold: number = 0.7): Promise<SimilarExample[]> {
    if (!this.vectorIndex || this.trainingData.length === 0) {
      return [];
    }

    // Generate embedding for the question
    const questionEmbedding = await this.generateEmbedding(question);

    // Search for similar examples
    const searchResults = this.vectorIndex.searchKnn(questionEmbedding, Math.min(limit * 2, this.trainingData.length));

    const similarExamples: SimilarExample[] = [];
    for (let i = 0; i < searchResults.distances.length; i++) {
      const similarity = 1 - searchResults.distances[i]; // Convert distance to similarity
      const label = searchResults.neighbors[i];
      if (similarity >= threshold && label < this.trainingData.length) {
        similarExamples.push({
          example: this.trainingData[label],
          similarity,
        });
      }
    }

    return similarExamples.slice(0, limit);
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'find_similar_queries',
          description: 'Find similar query examples based on a natural language question',
          inputSchema: {
            type: 'object',
            properties: {
              question: {
                type: 'string',
                description: 'The natural language question to find similar examples for',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of similar examples to return (default: 3)',
                minimum: 1,
                maximum: 10,
                default: 3,
              },
              threshold: {
                type: 'number',
                description: 'Minimum similarity threshold (0-1, default: 0.7)',
                minimum: 0,
                maximum: 1,
                default: 0.7,
              },
            },
            required: ['question'],
          },
        },
        {
          name: 'add_training_example',
          description: 'Add a new question-query pair to the training dataset',
          inputSchema: {
            type: 'object',
            properties: {
              question: {
                type: 'string',
                description: 'The natural language question',
              },
              query: {
                type: 'string',
                description: 'The corresponding query',
              },
              metadata: {
                type: 'object',
                description: 'Optional metadata (domain, complexity, tags, etc.)',
                properties: {
                  domain: { type: 'string' },
                  complexity: { type: 'string', enum: ['simple', 'medium', 'complex'] },
                  tags: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            required: ['question', 'query'],
          },
        },
        {
          name: 'list_training_examples',
          description: 'List all training examples in the dataset',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Maximum number of examples to return (default: 10)',
                minimum: 1,
                maximum: 100,
                default: 10,
              },
              domain: {
                type: 'string',
                description: 'Filter by domain',
              },
            },
          },
        },
        {
          name: 'find_duplicates',
          description: 'Find duplicate training examples based on question and query',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'remove_duplicates',
          description: 'Remove duplicate training examples, keeping only the first occurrence of each unique question-query pair',
          inputSchema: {
            type: 'object',
            properties: {
              confirm: {
                type: 'boolean',
                description: 'Set to true to confirm removal of duplicates',
                default: false,
              },
            },
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'find_similar_queries':
          return await this.handleFindSimilarQueries(request.params.arguments);
        case 'add_training_example':
          return await this.handleAddTrainingExample(request.params.arguments);
        case 'list_training_examples':
          return await this.handleListTrainingExamples(request.params.arguments);
        case 'find_duplicates':
          return await this.handleFindDuplicates(request.params.arguments);
        case 'remove_duplicates':
          return await this.handleRemoveDuplicates(request.params.arguments);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private async handleFindSimilarQueries(args: any) {
    if (!isValidFindSimilarArgs(args)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid arguments for find_similar_queries'
      );
    }

    try {
      const { question, limit = 3, threshold = 0.7 } = args;
      const similarExamples = await this.findSimilarExamples(question, limit, threshold);

      if (similarExamples.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No similar examples found. You may need to add more training data or lower the similarity threshold.',
            },
          ],
        };
      }

      // Format as few-shot examples
      const fewShotPrompt = similarExamples
        .map((item, index) => {
          return `Example ${index + 1} (similarity: ${item.similarity.toFixed(3)}):
Question: ${item.example.question}
Query: ${item.example.query}
${item.example.metadata?.domain ? `Domain: ${item.example.metadata.domain}` : ''}
${item.example.metadata?.complexity ? `Complexity: ${item.example.metadata.complexity}` : ''}`;
        })
        .join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${similarExamples.length} similar examples for: "${question}"\n\n${fewShotPrompt}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error finding similar queries: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleAddTrainingExample(args: any) {
    if (!isValidAddExampleArgs(args)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid arguments for add_training_example'
      );
    }

    try {
      const { question, query, metadata } = args;
      const id = await this.addTrainingExample(question, query, metadata);

      return {
        content: [
          {
            type: 'text',
            text: `Successfully added training example with ID: ${id}\nQuestion: ${question}\nQuery: ${query}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error adding training example: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleListTrainingExamples(args: any) {
    const limit = args?.limit || 10;
    const domain = args?.domain;

    let examples = this.trainingData;
    
    // Filter by domain if specified
    if (domain) {
      examples = examples.filter(ex => ex.metadata?.domain === domain);
    }

    // Limit results
    examples = examples.slice(0, limit);

    const examplesList = examples
      .map((example, index) => {
        return `${index + 1}. ID: ${example.id}
   Question: ${example.question}
   Query: ${example.query}
   ${example.metadata?.domain ? `Domain: ${example.metadata.domain}` : ''}
   ${example.metadata?.complexity ? `Complexity: ${example.metadata.complexity}` : ''}
   Created: ${example.metadata?.created_at || 'Unknown'}`;
      })
      .join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `Training Examples (showing ${examples.length} of ${this.trainingData.length} total):\n\n${examplesList}`,
        },
      ],
    };
  }

  private async handleFindDuplicates(args: any) {
    try {
      const duplicateGroups: { [key: string]: TrainingExample[] } = {};
      
      // Group examples by normalized question + query
      this.trainingData.forEach(example => {
        const key = `${example.question.toLowerCase().trim()}|||${example.query.toLowerCase().trim()}`;
        if (!duplicateGroups[key]) {
          duplicateGroups[key] = [];
        }
        duplicateGroups[key].push(example);
      });

      // Find groups with more than one example (duplicates)
      const duplicates = Object.values(duplicateGroups).filter(group => group.length > 1);

      if (duplicates.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No duplicate training examples found.',
            },
          ],
        };
      }

      let duplicateCount = 0;
      const duplicatesList = duplicates
        .map((group, groupIndex) => {
          duplicateCount += group.length - 1; // Count extras (keep first, remove rest)
          const examples = group
            .map((example, index) => {
              return `   ${index === 0 ? '[KEEP]' : '[DUPLICATE]'} ID: ${example.id}
      Created: ${example.metadata?.created_at || 'Unknown'}`;
            })
            .join('\n');
          
          return `Duplicate Group ${groupIndex + 1}:
   Question: "${group[0].question}"
   Query: "${group[0].query}"
   Examples:
${examples}`;
        })
        .join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${duplicates.length} duplicate groups with ${duplicateCount} duplicate entries:\n\n${duplicatesList}\n\nUse 'remove_duplicates' tool with confirm=true to remove duplicates.`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error finding duplicates: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleRemoveDuplicates(args: any) {
    try {
      const confirm = args?.confirm === true;

      if (!confirm) {
        return {
          content: [
            {
              type: 'text',
              text: 'This operation will remove duplicate training examples. Set confirm=true to proceed.\nUse find_duplicates first to see what will be removed.',
            },
          ],
        };
      }

      const duplicateGroups: { [key: string]: TrainingExample[] } = {};
      
      // Group examples by normalized question + query
      this.trainingData.forEach(example => {
        const key = `${example.question.toLowerCase().trim()}|||${example.query.toLowerCase().trim()}`;
        if (!duplicateGroups[key]) {
          duplicateGroups[key] = [];
        }
        duplicateGroups[key].push(example);
      });

      // Find duplicates and collect IDs to remove
      const idsToRemove: string[] = [];
      const duplicateGroups_filtered = Object.values(duplicateGroups).filter(group => group.length > 1);
      
      duplicateGroups_filtered.forEach(group => {
        // Sort by creation date to keep the oldest one
        group.sort((a, b) => {
          const dateA = new Date(a.metadata?.created_at || '1970-01-01').getTime();
          const dateB = new Date(b.metadata?.created_at || '1970-01-01').getTime();
          return dateA - dateB;
        });
        
        // Keep the first (oldest), remove the rest
        for (let i = 1; i < group.length; i++) {
          idsToRemove.push(group[i].id);
        }
      });

      if (idsToRemove.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No duplicates found to remove.',
            },
          ],
        };
      }

      // Remove duplicates from training data
      const originalCount = this.trainingData.length;
      this.trainingData = this.trainingData.filter(example => !idsToRemove.includes(example.id));

      // Rebuild vector index with remaining data
      this.vectorIndex = new HierarchicalNSW('cosine', EMBEDDING_DIMENSION);
      this.vectorIndex.initIndex(MAX_ELEMENTS);
      this.idToIndex.clear();

      // Re-add all remaining examples to vector index
      for (let i = 0; i < this.trainingData.length; i++) {
        const example = this.trainingData[i];
        const embedding = await this.generateEmbedding(example.question);
        this.vectorIndex.addPoint(embedding, i);
        this.idToIndex.set(example.id, i);
      }

      // Save updated data
      await this.saveData();

      return {
        content: [
          {
            type: 'text',
            text: `Successfully removed ${idsToRemove.length} duplicate examples.\nOriginal count: ${originalCount}\nNew count: ${this.trainingData.length}\nRemoved IDs: ${idsToRemove.join(', ')}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error removing duplicates: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }

  private setupResourceHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'query-assistant://training-data',
          name: 'Training Dataset',
          mimeType: 'application/json',
          description: 'Complete training dataset of question-query pairs',
        },
      ],
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      if (request.params.uri === 'query-assistant://training-data') {
        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: 'application/json',
              text: JSON.stringify(this.trainingData, null, 2),
            },
          ],
        };
      }

      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unknown resource: ${request.params.uri}`
      );
    });
  }

  async run() {
    // Initialize vector store
    await this.initializeVectorStore();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Query Assistant MCP server running on stdio');
  }
}

const server = new queryAssistant();
server.run().catch(console.error);
