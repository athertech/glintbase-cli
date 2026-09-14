import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatColoredDiff,
  renderArtifactCard,
  reviewArtifact,
  openInEditor,
  DiffReviewItem,
} from '../src/output/diff.js';

describe('Phase 5: Hairline TUI & Interactive Diff Reviewer', () => {
  it('formats unified diff with colored line indicators', () => {
    const rawDiff = `--- a/public/auth.md
+++ b/public/auth.md
@@ -1,3 +1,5 @@
-old title
+new title
+extra line`;

    const formatted = formatColoredDiff(rawDiff);
    expect(formatted).toBeDefined();
    // Verify diff output contains lines
    expect(formatted).toContain('new title');
    expect(formatted).toContain('old title');
  });

  it('renders hairline artifact preview card cleanly', () => {
    const item: DiffReviewItem = {
      file: 'auth.md',
      path: '/path/to/public/auth.md',
      subagentName: 'WorkOS Authentication (auth-md)',
      action: 'create',
      proposedContent: '# Auth Handbook\nBearer token...',
      sandboxPassed: true,
      scoreImpact: 15,
    };

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    renderArtifactCard(item, 0, 3);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('automatically applies in non-interactive/CI environments', async () => {
    const item: DiffReviewItem = {
      file: 'robots.txt',
      path: '/path/to/robots.txt',
      subagentName: 'Discovery Subagent',
      action: 'create',
      proposedContent: 'User-agent: ClaudeBot\nAllow: /',
      sandboxPassed: true,
    };

    // process.stdin.isTTY is false in vitest environment
    const decision = await reviewArtifact(item, 0, 1);
    expect(decision.action).toBe('apply');
    if (decision.action === 'apply') {
      expect(decision.content).toBe(item.proposedContent);
    }
  });

  it('handles editor fallback safely if editor exits without change', () => {
    const initial = 'sample content';
    const oldEditor = process.env.EDITOR;
    try {
      // Use non-interactive command that exits immediately
      process.env.EDITOR = 'node -e process.exit(0)';
      const result = openInEditor(initial, '.md');
      expect(result).toBe(initial);
    } finally {
      process.env.EDITOR = oldEditor;
    }
  });
});
