/**
 * Prismer CLI — manage API keys, register IM agents, and check status.
 *
 * Usage:
 *   prismer init <api-key>
 *   prismer register <username>
 *   prismer status
 *   prismer config show
 *   prismer config set <key> <value>
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as TOML from '@iarna/toml';
import { PrismerClient } from './index';

// Read version from package.json (works in CJS bundle where __dirname is available)
let cliVersion = '1.3.3';
try {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  cliVersion = pkg.version || cliVersion;
} catch {}

// ============================================================================
// Config helpers
// ============================================================================

const CONFIG_DIR = path.join(os.homedir(), '.prismer');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.toml');

interface PrismerCLIConfig {
  default?: {
    api_key?: string;
    environment?: string;
    base_url?: string;
  };
  auth?: {
    im_token?: string;
    im_user_id?: string;
    im_username?: string;
    im_token_expires?: string;
  };
  [key: string]: unknown;
}

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function readConfig(): PrismerCLIConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    return {};
  }
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  return TOML.parse(raw) as unknown as PrismerCLIConfig;
}

function writeConfig(config: PrismerCLIConfig): void {
  ensureConfigDir();
  const content = TOML.stringify(config as any);
  fs.writeFileSync(CONFIG_PATH, content, 'utf-8');
}

function setNestedValue(obj: Record<string, any>, dotPath: string, value: string): void {
  const parts = dotPath.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (current[key] === undefined || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key] as Record<string, any>;
  }
  current[parts[parts.length - 1]] = value;
}

// ============================================================================
// Client helpers
// ============================================================================

function getIMClient(): PrismerClient {
  const cfg = readConfig();
  const token = cfg?.auth?.im_token;
  if (!token) { console.error('No IM token. Run "prismer register" first.'); process.exit(1); }
  const env = cfg?.default?.environment || 'production';
  const baseUrl = cfg?.default?.base_url || '';
  return new PrismerClient({ apiKey: token, environment: env as any, ...(baseUrl ? { baseUrl } : {}) });
}

function getAPIClient(): PrismerClient {
  const cfg = readConfig();
  const apiKey = cfg?.default?.api_key;
  if (!apiKey) { console.error('No API key. Run "prismer init <api-key>" first.'); process.exit(1); }
  const env = cfg?.default?.environment || 'production';
  const baseUrl = cfg?.default?.base_url || '';
  return new PrismerClient({ apiKey, environment: env as any, ...(baseUrl ? { baseUrl } : {}) });
}

// ============================================================================
// CLI
// ============================================================================

const program = new Command();

program
  .name('prismer')
  .description('Prismer Cloud SDK CLI')
  .version(cliVersion);

// --- init -------------------------------------------------------------------

program
  .command('init <api-key>')
  .description('Store API key in ~/.prismer/config.toml')
  .action((apiKey: string) => {
    const config = readConfig();
    if (!config.default) {
      config.default = {};
    }
    config.default.api_key = apiKey;
    if (!config.default.environment) {
      config.default.environment = 'production';
    }
    if (config.default.base_url === undefined) {
      config.default.base_url = '';
    }
    writeConfig(config);
    console.log('API key saved to ~/.prismer/config.toml');
  });

// --- register ---------------------------------------------------------------

program
  .command('register <username>')
  .description('Register an IM agent and store the token')
  .option('--type <type>', 'Identity type: agent or human', 'agent')
  .option('--display-name <name>', 'Display name for the agent')
  .option('--agent-type <agentType>', 'Agent type: assistant, specialist, orchestrator, tool, or bot')
  .option('--capabilities <caps>', 'Comma-separated list of capabilities')
  .action(async (username: string, opts: {
    type: string;
    displayName?: string;
    agentType?: string;
    capabilities?: string;
  }) => {
    const config = readConfig();
    const apiKey = config.default?.api_key;

    if (!apiKey) {
      console.error('Error: No API key configured. Run "prismer init <api-key>" first.');
      process.exit(1);
    }

    const client = new PrismerClient({
      apiKey,
      environment: (config.default?.environment as 'production') || 'production',
      baseUrl: config.default?.base_url || undefined,
    });

    const registerOpts: Parameters<typeof client.im.account.register>[0] = {
      type: opts.type as 'agent' | 'human',
      username,
      displayName: opts.displayName || username,
    };

    if (opts.agentType) {
      registerOpts.agentType = opts.agentType as 'assistant' | 'specialist' | 'orchestrator' | 'tool' | 'bot';
    }

    if (opts.capabilities) {
      registerOpts.capabilities = opts.capabilities.split(',').map((c) => c.trim());
    }

    try {
      const result = await client.im.account.register(registerOpts);

      if (!result.ok || !result.data) {
        console.error('Registration failed:', result.error?.message || 'Unknown error');
        process.exit(1);
      }

      const data = result.data;

      // Store auth details
      if (!config.auth) {
        config.auth = {};
      }
      config.auth.im_token = data.token;
      config.auth.im_user_id = data.imUserId;
      config.auth.im_username = data.username;
      config.auth.im_token_expires = data.expiresIn;
      writeConfig(config);

      console.log('Registration successful!');
      console.log(`  User ID:  ${data.imUserId}`);
      console.log(`  Username: ${data.username}`);
      console.log(`  Display:  ${data.displayName}`);
      console.log(`  Role:     ${data.role}`);
      console.log(`  New:      ${data.isNew}`);
      console.log(`  Expires:  ${data.expiresIn}`);
      console.log('');
      console.log('Token stored in ~/.prismer/config.toml');
    } catch (err) {
      console.error('Registration failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

// --- status -----------------------------------------------------------------

program
  .command('status')
  .description('Show current config and token status')
  .action(async () => {
    const config = readConfig();

    console.log('=== Prismer Status ===');
    console.log('');

    // Config section
    const apiKey = config.default?.api_key;
    if (apiKey) {
      const masked = apiKey.length > 16
        ? apiKey.slice(0, 12) + '...' + apiKey.slice(-4)
        : '***';
      console.log(`API Key:     ${masked}`);
    } else {
      console.log('API Key:     (not set)');
    }
    console.log(`Environment: ${config.default?.environment || '(not set)'}`);
    console.log(`Base URL:    ${config.default?.base_url || '(default)'}`);
    console.log('');

    // Auth section
    const token = config.auth?.im_token;
    if (token) {
      console.log(`IM User ID:  ${config.auth?.im_user_id || '(unknown)'}`);
      console.log(`IM Username: ${config.auth?.im_username || '(unknown)'}`);

      const expires = config.auth?.im_token_expires;
      if (expires) {
        const expiresDate = new Date(expires);
        if (!isNaN(expiresDate.getTime())) {
          const now = new Date();
          const isExpired = expiresDate <= now;
          const label = isExpired ? 'EXPIRED' : 'valid';
          console.log(`IM Token:    ${label} (expires ${expiresDate.toISOString()})`);
        } else {
          // Duration string like "7d"
          console.log(`IM Token:    set (expires in ${expires})`);
        }
      } else {
        console.log('IM Token:    set (expiry unknown)');
      }
    } else {
      console.log('IM Token:    (not registered)');
    }

    // Live info (me() requires JWT token, not API key)
    if (token) {
      console.log('');
      console.log('--- Live Info ---');
      try {
        const client = new PrismerClient({
          apiKey: token,
          environment: (config.default?.environment as 'production') || 'production',
          baseUrl: config.default?.base_url || undefined,
        });
        const me = await client.im.account.me();
        if (me.ok && me.data) {
          console.log(`Display:     ${me.data.user.displayName}`);
          console.log(`Role:        ${me.data.user.role}`);
          console.log(`Credits:     ${me.data.credits.balance}`);
          console.log(`Messages:    ${me.data.stats.messagesSent}`);
          console.log(`Unread:      ${me.data.stats.unreadCount}`);
        } else {
          console.log(`Could not fetch live info: ${me.error?.message || 'unknown error'}`);
        }
      } catch (err) {
        console.log(`Could not fetch live info: ${err instanceof Error ? err.message : err}`);
      }
    }
  });

// --- config -----------------------------------------------------------------

const configCmd = program
  .command('config')
  .description('Manage config file');

configCmd
  .command('show')
  .description('Print config file contents')
  .action(() => {
    if (!fs.existsSync(CONFIG_PATH)) {
      console.log('No config file found at ~/.prismer/config.toml');
      console.log('Run "prismer init <api-key>" to create one.');
      return;
    }
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    console.log(raw);
  });

configCmd
  .command('set <key> <value>')
  .description('Set a config value (e.g., prismer config set default.api_key sk-prismer-...)')
  .action((key: string, value: string) => {
    const config = readConfig();
    setNestedValue(config as Record<string, any>, key, value);
    writeConfig(config);
    console.log(`Set ${key} = ${value}`);
  });

// === IM Commands ============================================================

const im = program.command('im').description('IM messaging commands');

im.command('me').description('Show current identity and stats').option('--json', 'JSON output').action(async (opts) => {
  const client = getIMClient();
  const res = await client.im.account.me();
  if (!res.ok) { console.error('Error:', res.error); process.exit(1); }
  const d = res.data;
  if (opts.json) { console.log(JSON.stringify(d, null, 2)); return; }
  console.log(`Display Name: ${d?.user?.displayName || '-'}`);
  console.log(`Username:     ${d?.user?.username || '-'}`);
  console.log(`Role:         ${d?.user?.role || '-'}`);
  console.log(`Agent Type:   ${d?.agentCard?.agentType || '-'}`);
  console.log(`Credits:      ${d?.credits?.balance ?? '-'}`);
  console.log(`Messages:     ${d?.stats?.messagesSent ?? '-'}`);
  console.log(`Unread:       ${d?.stats?.unreadCount ?? '-'}`);
});

im.command('health').description('Check IM service health').action(async () => {
  const client = getIMClient();
  const res = await client.im.health();
  console.log(`IM Service: ${res.ok ? 'OK' : 'ERROR'}`);
  if (!res.ok) { console.error(res.error); process.exit(1); }
});

im.command('send').description('Send a direct message').argument('<user-id>', 'Target user ID').argument('<message>', 'Message content').option('--json', 'JSON output').action(async (userId, message, opts) => {
  const client = getIMClient();
  const res = await client.im.direct.send(userId, message);
  if (!res.ok) { console.error('Error:', res.error); process.exit(1); }
  if (opts.json) { console.log(JSON.stringify(res.data, null, 2)); return; }
  console.log(`Message sent (conversationId: ${res.data?.conversationId})`);
});

im.command('messages').description('View direct message history').argument('<user-id>', 'Target user ID').option('-n, --limit <n>', 'Max messages', '20').option('--json', 'JSON output').action(async (userId, opts) => {
  const client = getIMClient();
  const res = await client.im.direct.getMessages(userId, { limit: parseInt(opts.limit) });
  if (!res.ok) { console.error('Error:', res.error); process.exit(1); }
  const msgs = res.data || [];
  if (opts.json) { console.log(JSON.stringify(msgs, null, 2)); return; }
  if (msgs.length === 0) { console.log('No messages.'); return; }
  for (const m of msgs) {
    const ts = m.createdAt ? new Date(m.createdAt).toLocaleString() : '';
    console.log(`[${ts}] ${m.senderId || '?'}: ${m.content}`);
  }
});

im.command('discover').description('Discover available agents').option('--type <type>', 'Filter by type').option('--capability <cap>', 'Filter by capability').option('--json', 'JSON output').action(async (opts) => {
  const client = getIMClient();
  const discoverOpts: Record<string, string> = {};
  if (opts.type) discoverOpts.type = opts.type;
  if (opts.capability) discoverOpts.capability = opts.capability;
  const res = await client.im.contacts.discover(discoverOpts);
  if (!res.ok) { console.error('Error:', res.error); process.exit(1); }
  const agents = res.data || [];
  if (opts.json) { console.log(JSON.stringify(agents, null, 2)); return; }
  if (agents.length === 0) { console.log('No agents found.'); return; }
  console.log('Username'.padEnd(20) + 'Type'.padEnd(14) + 'Status'.padEnd(10) + 'Display Name');
  for (const a of agents) {
    console.log(`${(a.username || '').padEnd(20)}${(a.agentType || '').padEnd(14)}${(a.status || '').padEnd(10)}${a.displayName || ''}`);
  }
});

im.command('contacts').description('List contacts').option('--json', 'JSON output').action(async (opts) => {
  const client = getIMClient();
  const res = await client.im.contacts.list();
  if (!res.ok) { console.error('Error:', res.error); process.exit(1); }
  const contacts = res.data || [];
  if (opts.json) { console.log(JSON.stringify(contacts, null, 2)); return; }
  if (contacts.length === 0) { console.log('No contacts.'); return; }
  console.log('Username'.padEnd(20) + 'Role'.padEnd(10) + 'Unread'.padEnd(8) + 'Display Name');
  for (const c of contacts) {
    console.log(`${(c.username || '').padEnd(20)}${(c.role || '').padEnd(10)}${String(c.unreadCount ?? 0).padEnd(8)}${c.displayName || ''}`);
  }
});

// Groups subcommand
const groups = im.command('groups').description('Group management');

groups.command('list').description('List groups').option('--json', 'JSON output').action(async (opts) => {
  const client = getIMClient();
  const res = await client.im.groups.list();
  if (!res.ok) { console.error('Error:', res.error); process.exit(1); }
  const list = res.data || [];
  if (opts.json) { console.log(JSON.stringify(list, null, 2)); return; }
  if (list.length === 0) { console.log('No groups.'); return; }
  for (const g of list) {
    console.log(`${g.groupId || ''}  ${g.title || ''} (${g.members?.length || '?'} members)`);
  }
});

groups.command('create').description('Create a group').argument('<title>', 'Group title').option('-m, --members <ids>', 'Comma-separated member IDs').option('--json', 'JSON output').action(async (title, opts) => {
  const client = getIMClient();
  const members = opts.members ? opts.members.split(',').map((s: string) => s.trim()) : [];
  const res = await client.im.groups.create({ title, members });
  if (!res.ok) { console.error('Error:', res.error); process.exit(1); }
  if (opts.json) { console.log(JSON.stringify(res.data, null, 2)); return; }
  console.log(`Group created (groupId: ${res.data?.groupId})`);
});

groups.command('send').description('Send message to group').argument('<group-id>', 'Group ID').argument('<message>', 'Message content').option('--json', 'JSON output').action(async (groupId, message, opts) => {
  const client = getIMClient();
  const res = await client.im.groups.send(groupId, message);
  if (!res.ok) { console.error('Error:', res.error); process.exit(1); }
  if (opts.json) { console.log(JSON.stringify(res.data, null, 2)); return; }
  console.log('Message sent to group.');
});

groups.command('messages').description('View group message history').argument('<group-id>', 'Group ID').option('-n, --limit <n>', 'Max messages', '20').option('--json', 'JSON output').action(async (groupId, opts) => {
  const client = getIMClient();
  const res = await client.im.groups.getMessages(groupId, { limit: parseInt(opts.limit) });
  if (!res.ok) { console.error('Error:', res.error); process.exit(1); }
  const msgs = res.data || [];
  if (opts.json) { console.log(JSON.stringify(msgs, null, 2)); return; }
  if (msgs.length === 0) { console.log('No messages.'); return; }
  for (const m of msgs) {
    const ts = m.createdAt ? new Date(m.createdAt).toLocaleString() : '';
    console.log(`[${ts}] ${m.senderId || '?'}: ${m.content}`);
  }
});

// Conversations subcommand
const convos = im.command('conversations').description('Conversation management');

convos.command('list').description('List conversations').option('--unread', 'Show unread only').option('--json', 'JSON output').action(async (opts) => {
  const client = getIMClient();
  const listOpts: { withUnread?: boolean; unreadOnly?: boolean } = {};
  if (opts.unread) { listOpts.withUnread = true; listOpts.unreadOnly = true; }
  const res = await client.im.conversations.list(listOpts);
  if (!res.ok) { console.error('Error:', res.error); process.exit(1); }
  const list = res.data || [];
  if (opts.json) { console.log(JSON.stringify(list, null, 2)); return; }
  if (list.length === 0) { console.log('No conversations.'); return; }
  for (const c of list) {
    const unread = c.unreadCount ? ` (${c.unreadCount} unread)` : '';
    console.log(`${c.id || ''}  ${c.type || ''}  ${c.title || ''}${unread}`);
  }
});

convos.command('read').description('Mark conversation as read').argument('<conversation-id>', 'Conversation ID').action(async (convId) => {
  const client = getIMClient();
  const res = await client.im.conversations.markAsRead(convId);
  if (!res.ok) { console.error('Error:', res.error); process.exit(1); }
  console.log('Marked as read.');
});

// Files subcommand
const files = im.command('files').description('File upload management');

files.command('upload').description('Upload a file').argument('<path>', 'File path to upload').option('--mime <type>', 'Override MIME type').option('--json', 'JSON output').action(async (filePath: string, opts: any) => {
  const client = getIMClient();
  try {
    const result = await client.im.files.upload(filePath, { mimeType: opts.mime });
    if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
    console.log(`Upload ID: ${result.uploadId}`);
    console.log(`CDN URL:   ${result.cdnUrl}`);
    console.log(`File:      ${result.fileName} (${result.fileSize} bytes)`);
    console.log(`MIME:      ${result.mimeType}`);
  } catch (err) {
    console.error('Upload failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
});

files.command('send').description('Upload file and send as message').argument('<conversation-id>', 'Conversation ID').argument('<path>', 'File path to upload').option('--content <text>', 'Message text').option('--mime <type>', 'Override MIME type').option('--json', 'JSON output').action(async (conversationId: string, filePath: string, opts: any) => {
  const client = getIMClient();
  try {
    const result = await client.im.files.sendFile(conversationId, filePath, { content: opts.content, mimeType: opts.mime });
    if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
    console.log(`Upload ID: ${result.upload.uploadId}`);
    console.log(`CDN URL:   ${result.upload.cdnUrl}`);
    console.log(`File:      ${result.upload.fileName}`);
    console.log(`Message:   sent`);
  } catch (err) {
    console.error('Send file failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
});

files.command('quota').description('Show storage quota').option('--json', 'JSON output').action(async (opts: any) => {
  const client = getIMClient();
  const res = await client.im.files.quota();
  if (!res.ok) { console.error('Error:', res.error); process.exit(1); }
  if (opts.json) { console.log(JSON.stringify(res.data, null, 2)); return; }
  const q = res.data;
  console.log(`Used:       ${q?.used ?? '-'} bytes`);
  console.log(`Limit:      ${q?.limit ?? '-'} bytes`);
  console.log(`File Count: ${q?.fileCount ?? '-'}`);
  console.log(`Tier:       ${q?.tier ?? '-'}`);
});

files.command('delete').description('Delete an uploaded file').argument('<upload-id>', 'Upload ID').action(async (uploadId: string) => {
  const client = getIMClient();
  const res = await client.im.files.delete(uploadId);
  if (!res.ok) { console.error('Error:', res.error); process.exit(1); }
  console.log(`Deleted upload ${uploadId}.`);
});

files.command('types').description('List allowed MIME types').option('--json', 'JSON output').action(async (opts: any) => {
  const client = getIMClient();
  const res = await client.im.files.types();
  if (!res.ok) { console.error('Error:', res.error); process.exit(1); }
  if (opts.json) { console.log(JSON.stringify(res.data, null, 2)); return; }
  const types = res.data?.allowedMimeTypes || [];
  console.log(`Allowed MIME types (${types.length}):`);
  for (const t of types) { console.log(`  ${t}`); }
});

im.command('credits').description('Show credits balance').option('--json', 'JSON output').action(async (opts) => {
  const client = getIMClient();
  const res = await client.im.credits.get();
  if (!res.ok) { console.error('Error:', res.error); process.exit(1); }
  if (opts.json) { console.log(JSON.stringify(res.data, null, 2)); return; }
  console.log(`Balance: ${res.data?.balance ?? '-'}`);
});

im.command('transactions').description('Transaction history').option('-n, --limit <n>', 'Max transactions', '20').option('--json', 'JSON output').action(async (opts) => {
  const client = getIMClient();
  const res = await client.im.credits.transactions({ limit: parseInt(opts.limit) });
  if (!res.ok) { console.error('Error:', res.error); process.exit(1); }
  const txns = res.data || [];
  if (opts.json) { console.log(JSON.stringify(txns, null, 2)); return; }
  if (txns.length === 0) { console.log('No transactions.'); return; }
  for (const t of txns) {
    console.log(`${t.createdAt || ''}  ${t.type || ''}  ${t.amount ?? ''}  ${t.description || ''}`);
  }
});

// === Context Commands ========================================================

const ctx = program.command('context').description('Context API commands');

ctx.command('load').description('Load URL content').argument('<url>', 'URL to load').option('-f, --format <fmt>', 'Return format: hqcc, raw, both', 'hqcc').option('--json', 'JSON output').action(async (url, opts) => {
  const client = getAPIClient();
  const loadOpts: Record<string, any> = {};
  if (opts.format) loadOpts.return = { format: opts.format };
  const res = await client.load(url, loadOpts);
  if (opts.json) { console.log(JSON.stringify(res, null, 2)); return; }
  if (!res.success) { console.error('Error:', res.error?.message || 'Load failed'); process.exit(1); }
  const r = res.result;
  console.log(`URL:     ${r?.url || url}`);
  console.log(`Status:  ${r?.cached ? 'cached' : 'loaded'}`);
  if (r?.hqcc) { console.log(`\n--- HQCC ---\n${r.hqcc.substring(0, 2000)}`); }
  if (r?.raw) { console.log(`\n--- Raw ---\n${r.raw.substring(0, 2000)}`); }
});

ctx.command('search').description('Search cached content').argument('<query>', 'Search query').option('-k, --top-k <n>', 'Number of results', '5').option('--json', 'JSON output').action(async (query, opts) => {
  const client = getAPIClient();
  const res = await client.search(query, { topK: parseInt(opts.topK) });
  if (opts.json) { console.log(JSON.stringify(res, null, 2)); return; }
  if (!res.success) { console.error('Error:', res.error?.message || 'Search failed'); process.exit(1); }
  const results = res.results || [];
  if (results.length === 0) { console.log('No results.'); return; }
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log(`${i + 1}. ${r.url || '(no url)'}  score: ${r.ranking?.score ?? '-'}`);
    if (r.hqcc) console.log(`   ${r.hqcc.substring(0, 200)}`);
  }
});

ctx.command('save').description('Save content to cache').argument('<url>', 'URL key').argument('<hqcc>', 'HQCC content').option('--json', 'JSON output').action(async (url, hqcc, opts) => {
  const client = getAPIClient();
  const res = await client.save({ url, hqcc });
  if (opts.json) { console.log(JSON.stringify(res, null, 2)); return; }
  if (!res.success) { console.error('Error:', res.error?.message || 'Save failed'); process.exit(1); }
  console.log('Content saved.');
});

// === Parse Commands ==========================================================

const parse = program.command('parse').description('Document parsing commands');

parse.command('run').description('Parse a document').argument('<url>', 'Document URL').option('-m, --mode <mode>', 'Parse mode: fast, hires, auto', 'fast').option('--json', 'JSON output').action(async (url, opts) => {
  const client = getAPIClient();
  const res = await client.parsePdf(url, opts.mode);
  if (opts.json) { console.log(JSON.stringify(res, null, 2)); return; }
  if (!res.success) { console.error('Error:', res.error?.message || 'Parse failed'); process.exit(1); }
  if (res.taskId) {
    console.log(`Task ID: ${res.taskId}`);
    console.log(`Status:  ${res.status || 'processing'}`);
    console.log(`\nCheck progress: prismer parse status ${res.taskId}`);
  } else if (res.document) {
    console.log(`Status: complete`);
    const content = res.document.markdown || res.document.text || JSON.stringify(res.document, null, 2);
    console.log(content.substring(0, 5000));
  }
});

parse.command('status').description('Check parse task status').argument('<task-id>', 'Task ID').option('--json', 'JSON output').action(async (taskId, opts) => {
  const client = getAPIClient();
  const res = await client.parseStatus(taskId);
  if (opts.json) { console.log(JSON.stringify(res, null, 2)); return; }
  console.log(`Task:   ${taskId}`);
  console.log(`Status: ${res.status || (res.success ? 'complete' : 'unknown')}`);
});

parse.command('result').description('Get parse result').argument('<task-id>', 'Task ID').option('--json', 'JSON output').action(async (taskId, opts) => {
  const client = getAPIClient();
  const res = await client.parseResult(taskId);
  if (opts.json) { console.log(JSON.stringify(res, null, 2)); return; }
  if (!res.success) { console.error('Error:', res.error?.message || 'Not ready'); process.exit(1); }
  const content = res.document?.markdown || res.document?.text || JSON.stringify(res.document, null, 2);
  console.log(content);
});

// --- parse & run ------------------------------------------------------------

program.parse(process.argv);
