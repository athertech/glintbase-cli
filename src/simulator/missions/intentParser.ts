/**
 * Intent Parser for Glintbase Flight Simulator.
 * Decomposes natural language agent prompts into structured action verbs,
 * candidate tool matches, and parameter mappings.
 */

export interface ParsedIntent {
  rawPrompt: string;
  actionVerb: string;
  targetEntity: string;
  isMutating: boolean;
  matchedTool?: {
    name: string;
    description: string;
    inputSchema?: any;
    confidence: number;
  };
  matchedPath?: {
    method: string;
    path: string;
    confidence: number;
  };
}

const READ_VERBS = ['get', 'read', 'fetch', 'list', 'search', 'query', 'find', 'check', 'show', 'view', 'inspect'];
const WRITE_VERBS = ['create', 'add', 'post', 'insert', 'update', 'modify', 'patch', 'delete', 'remove', 'drop', 'charge', 'pay'];

export class IntentParser {
  /**
   * Parses a natural language intent against discovered tools and OpenAPI routes.
   */
  static parse(
    prompt: string,
    availableTools: Array<{ name: string; description: string; inputSchema?: any }> = [],
    openApiRoutes: Array<{ method: string; path: string; summary?: string }> = []
  ): ParsedIntent {
    const tokens = prompt.toLowerCase().replace(/[^a-z0-9_\s-]/g, ' ').split(/\s+/).filter(Boolean);
    
    // 1. Identify primary verb
    let actionVerb = 'get';
    for (const token of tokens) {
      if (READ_VERBS.includes(token)) {
        actionVerb = token;
        break;
      }
      if (WRITE_VERBS.includes(token)) {
        actionVerb = token;
        break;
      }
    }

    const isMutating = WRITE_VERBS.includes(actionVerb);

    // 2. Identify target entity (remaining nouns)
    const entityTokens = tokens.filter(t => t !== actionVerb && !['the', 'a', 'an', 'to', 'for', 'in', 'on', 'at', 'with', 'from', 'my', 'all'].includes(t));
    const targetEntity = entityTokens.join('_') || 'resource';

    // 3. Match against MCP tools
    let bestTool: ParsedIntent['matchedTool'] | undefined;
    let highestToolScore = 0;

    for (const tool of availableTools) {
      let score = 0;
      const toolNameLower = tool.name.toLowerCase();
      const toolDescLower = (tool.description || '').toLowerCase();

      for (const token of entityTokens) {
        if (toolNameLower.includes(token)) score += 2;
        if (toolDescLower.includes(token)) score += 1;
      }

      if (toolNameLower.includes(actionVerb)) score += 1.5;

      if (score > highestToolScore) {
        highestToolScore = score;
        bestTool = {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          confidence: Math.min(score / (entityTokens.length + 1), 1.0)
        };
      }
    }

    // 4. Match against OpenAPI routes if no tool matched with high confidence
    let bestPath: ParsedIntent['matchedPath'] | undefined;
    let highestPathScore = 0;

    for (const route of openApiRoutes) {
      let score = 0;
      const pathLower = route.path.toLowerCase();
      const summaryLower = (route.summary || '').toLowerCase();

      for (const token of entityTokens) {
        if (pathLower.includes(token)) score += 2;
        if (summaryLower.includes(token)) score += 1;
      }

      if (isMutating && route.method !== 'GET') score += 1;
      if (!isMutating && route.method === 'GET') score += 1;

      if (score > highestPathScore) {
        highestPathScore = score;
        bestPath = {
          method: route.method,
          path: route.path,
          confidence: Math.min(score / (entityTokens.length + 1), 1.0)
        };
      }
    }

    return {
      rawPrompt: prompt,
      actionVerb,
      targetEntity,
      isMutating,
      matchedTool: highestToolScore >= 1 ? bestTool : undefined,
      matchedPath: highestPathScore >= 1 ? bestPath : undefined
    };
  }
}
