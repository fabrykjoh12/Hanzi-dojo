import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const dojoWorkspaces = sqliteTable('dojo_workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  inviteHash: text('invite_hash').notNull().unique(),
  ownerId: text('owner_id').notNull(),
  revision: integer('revision').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const dojoMembers = sqliteTable('dojo_members', {
  workspaceId: text('workspace_id').notNull().references(() => dojoWorkspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role').notNull().default('member'),
  joinedAt: text('joined_at').notNull(),
}, table => [primaryKey({ columns: [table.workspaceId, table.userId] })])

export const dojoItems = sqliteTable('dojo_items', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => dojoWorkspaces.id, { onDelete: 'cascade' }),
  createdBy: text('created_by').notNull(),
  assignedTo: text('assigned_to'),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  itemType: text('item_type').notNull(),
  status: text('status').notNull(),
  priority: text('priority').notNull(),
  tagsJson: text('tags_json').notNull().default('[]'),
  dueDate: text('due_date'),
  milestoneId: text('milestone_id'),
  dependsOnJson: text('depends_on_json').notNull().default('[]'),
  blockedReason: text('blocked_reason').notNull().default(''),
  githubBranch: text('github_branch').notNull().default(''),
  githubPrUrl: text('github_pr_url').notNull().default(''),
  ciStatus: text('ci_status').notNull().default('none'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const dojoComments = sqliteTable('dojo_comments', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => dojoWorkspaces.id, { onDelete: 'cascade' }),
  itemId: text('item_id').notNull().references(() => dojoItems.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull(),
  body: text('body').notNull(),
  createdAt: text('created_at').notNull(),
})

export const dojoAttachments = sqliteTable('dojo_attachments', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => dojoWorkspaces.id, { onDelete: 'cascade' }),
  itemId: text('item_id').notNull().references(() => dojoItems.id, { onDelete: 'cascade' }),
  createdBy: text('created_by').notNull(),
  storagePath: text('storage_path').notNull().unique(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  createdAt: text('created_at').notNull(),
})

export const dojoBridgeClients = sqliteTable('dojo_bridge_clients', {
  workspaceId: text('workspace_id').notNull().references(() => dojoWorkspaces.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull(),
  displayName: text('display_name').notNull(),
  version: text('version'),
  bridgeVersion: text('bridge_version'),
  projectRoot: text('project_root'),
  readmeFound: integer('readme_found').notNull().default(0),
  documentsJson: text('documents_json').notNull().default('[]'),
  lastSeen: text('last_seen').notNull(),
}, table => [primaryKey({ columns: [table.workspaceId, table.clientId] })])

export const dojoBridgeCommands = sqliteTable('dojo_bridge_commands', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => dojoWorkspaces.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  payloadJson: text('payload_json').notNull().default('{}'),
  status: text('status').notNull().default('queued'),
  resultJson: text('result_json'),
  errorText: text('error_text'),
  clientId: text('client_id'),
  createdAt: text('created_at').notNull(),
  claimedAt: text('claimed_at'),
  completedAt: text('completed_at'),
})

export const dojoMilestones = sqliteTable('dojo_milestones', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => dojoWorkspaces.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('planned'),
  targetDate: text('target_date'),
  color: text('color').notNull().default('#D9FF57'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const dojoTestCases = sqliteTable('dojo_test_cases', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => dojoWorkspaces.id, { onDelete: 'cascade' }),
  itemId: text('item_id').notNull().references(() => dojoItems.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  expected: text('expected').notNull().default(''),
  notes: text('notes').notNull().default(''),
  status: text('status').notNull().default('pending'),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const dojoAgentRuns = sqliteTable('dojo_agent_runs', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => dojoWorkspaces.id, { onDelete: 'cascade' }),
  itemId: text('item_id').notNull().references(() => dojoItems.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('queued'),
  summary: text('summary').notNull().default(''),
  filesJson: text('files_json').notNull().default('[]'),
  testsJson: text('tests_json').notNull().default('[]'),
  branch: text('branch').notNull().default(''),
  prUrl: text('pr_url').notNull().default(''),
  ciStatus: text('ci_status').notNull().default('none'),
  startedBy: text('started_by').notNull(),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  updatedAt: text('updated_at').notNull(),
})

export const dojoActivity = sqliteTable('dojo_activity', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => dojoWorkspaces.id, { onDelete: 'cascade' }),
  itemId: text('item_id'),
  actorId: text('actor_id').notNull(),
  eventType: text('event_type').notNull(),
  summary: text('summary').notNull(),
  metadataJson: text('metadata_json').notNull().default('{}'),
  createdAt: text('created_at').notNull(),
})

export const dojoPresence = sqliteTable('dojo_presence', {
  workspaceId: text('workspace_id').notNull().references(() => dojoWorkspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  displayName: text('display_name').notNull(),
  activeItemId: text('active_item_id'),
  lastSeen: text('last_seen').notNull(),
}, table => [primaryKey({ columns: [table.workspaceId, table.userId] })])

export const dojoItemVersions = sqliteTable('dojo_item_versions', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => dojoWorkspaces.id, { onDelete: 'cascade' }),
  itemId: text('item_id').notNull().references(() => dojoItems.id, { onDelete: 'cascade' }),
  actorId: text('actor_id').notNull(),
  snapshotJson: text('snapshot_json').notNull(),
  createdAt: text('created_at').notNull(),
})
