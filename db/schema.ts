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
