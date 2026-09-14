# WebMCP Reference Specification (v0.9.1)

## Overview
WebMCP bridges headless browser agents and client-side web applications by exposing a structured, machine-callable `window.modelContext` object.

## Schema Definition (TypeScript)
```typescript
declare global {
  interface Window {
    modelContext?: WebMcpContext;
  }
}

export interface WebMcpTool {
  name: string;
  description: string;
  parameters?: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
  execute?: (args: Record<string, any>) => Promise<any> | any;
}

export interface WebMcpContext {
  version: '0.9.1';
  agentReady: boolean;
  platform?: string;
  tools: WebMcpTool[];
  state?: Record<string, any>;
}
```

## Lifecycle & Custom Event
When `window.modelContext` is mounted, dispatch the `modelContextReady` event:
```typescript
window.dispatchEvent(new CustomEvent('modelContextReady', { detail: window.modelContext }));
```
Browser agents listen for this event or poll `window.modelContext` during navigation.
