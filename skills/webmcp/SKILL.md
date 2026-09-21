---
name: webmcp
description: Client-side agent tool registration via W3C draft window.modelContext and HTML form tool tags.
---

# WebMCP Browser & Client Interoperability

WebMCP enables web applications to expose tools and actions directly to browser-operating AI agents (e.g. ChatGPT Agent, Claude Computer Use, Antigravity) through `window.modelContext`.

## 1. window.modelContext Standard

```typescript
interface WebMcpTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

declare global {
  interface Window {
    modelContext?: {
      registerTool: (tool: WebMcpTool) => void;
      getTools: () => WebMcpTool[];
    };
  }
}
```

## 2. React WebMcpProvider Component (`WebMcpProvider.tsx`)

```tsx
'use client';

import React, { createContext, useEffect, useState } from 'react';

export const WebMcpContext = createContext<{ ready: boolean }>({ ready: false });

export function WebMcpProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const tools: Record<string, any> = {};

    window.modelContext = {
      registerTool: (tool) => {
        tools[tool.name] = tool;
      },
      getTools: () => Object.values(tools),
    };

    window.dispatchEvent(new CustomEvent('modelContextReady'));
    setReady(true);
  }, []);

  return (
    <WebMcpContext.Provider value={{ ready }}>
      {children}
    </WebMcpContext.Provider>
  );
}
```
