'use client';

/**
 * McpAccessPanel
 *
 * Workspace settings panel that lets the owner generate, list, and revoke
 * MCP tokens. The plaintext is shown exactly once on creation; thereafter
 * only the prefix and metadata are visible.
 *
 * Wire this component into a workspace settings dialog/host once one exists.
 * Until then it is a self-contained section that can be mounted anywhere.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface TokenSummary {
  id: string;
  prefix: string;
  name: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export function McpAccessPanel({ workspaceId }: { workspaceId: string }) {
  const [tokens, setTokens] = useState<TokenSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [revealed, setRevealed] = useState<{ name: string; plaintext: string } | null>(null);

  async function refresh() {
    const res = await fetch(`/api/workspace/${workspaceId}/mcp-tokens`);
    const json = await res.json();
    if (json.success) setTokens(json.data);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/mcp-tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setRevealed({ name: json.data.name, plaintext: json.data.plaintext });
      setNewName('');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create token');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(tokenId: string) {
    const res = await fetch(`/api/workspace/${workspaceId}/mcp-tokens/${tokenId}`, {
      method: 'DELETE',
    });
    const json = await res.json();
    if (json.success) {
      toast.success('Token revoked');
      await refresh();
    } else {
      toast.error(json.error || 'Failed to revoke');
    }
  }

  return (
    <section className="space-y-4">
      <header>
        <h3 className="text-base font-semibold">MCP Access</h3>
        <p className="text-sm text-muted-foreground">
          Generate per-workspace tokens for MCP-capable agents (Claude Desktop, Cursor, Codex, ...).
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Endpoint: <code>/api/mcp/workspace/{workspaceId}/</code>
        </p>
      </header>

      <div className="space-y-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Token name (e.g., 'Claude Desktop')"
          className="border rounded px-2 py-1 w-full"
        />
        <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
          {creating ? 'Generating...' : 'Generate Token'}
        </Button>
      </div>

      {revealed && (
        <div className="border rounded p-3 bg-yellow-50 space-y-2">
          <p className="text-sm font-medium">Copy this token now — it will not be shown again:</p>
          <code className="block break-all bg-white p-2 text-xs">{revealed.plaintext}</code>
          <Button
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(revealed.plaintext);
              toast.success('Copied to clipboard');
            }}
          >
            Copy
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRevealed(null)}>
            I have copied it
          </Button>
        </div>
      )}

      <ul className="space-y-1 text-sm">
        {tokens.map((t) => (
          <li key={t.id} className="flex items-center justify-between border rounded px-3 py-2">
            <div>
              <span className="font-mono text-xs">{t.prefix}</span> · {t.name}
              {t.revokedAt && <span className="ml-2 text-red-500 text-xs">revoked</span>}
              {t.lastUsedAt && (
                <span className="ml-2 text-xs text-muted-foreground">
                  last used {new Date(t.lastUsedAt).toLocaleString()}
                </span>
              )}
            </div>
            {!t.revokedAt && (
              <Button size="sm" variant="ghost" onClick={() => handleRevoke(t.id)}>
                Revoke
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
