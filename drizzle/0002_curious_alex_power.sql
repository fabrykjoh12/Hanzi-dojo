CREATE TABLE `dojo_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`item_id` text,
	`actor_id` text NOT NULL,
	`event_type` text NOT NULL,
	`summary` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `dojo_workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `dojo_agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`item_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`files_json` text DEFAULT '[]' NOT NULL,
	`tests_json` text DEFAULT '[]' NOT NULL,
	`branch` text DEFAULT '' NOT NULL,
	`pr_url` text DEFAULT '' NOT NULL,
	`ci_status` text DEFAULT 'none' NOT NULL,
	`started_by` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `dojo_workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `dojo_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `dojo_item_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`item_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `dojo_workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `dojo_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `dojo_milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`target_date` text,
	`color` text DEFAULT '#D9FF57' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `dojo_workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `dojo_presence` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`active_item_id` text,
	`last_seen` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `dojo_workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `dojo_test_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`item_id` text NOT NULL,
	`title` text NOT NULL,
	`expected` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `dojo_workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `dojo_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `dojo_bridge_clients` ADD `bridge_version` text;--> statement-breakpoint
ALTER TABLE `dojo_bridge_clients` ADD `project_root` text;--> statement-breakpoint
ALTER TABLE `dojo_bridge_clients` ADD `readme_found` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `dojo_bridge_clients` ADD `documents_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `dojo_items` ADD `milestone_id` text;--> statement-breakpoint
ALTER TABLE `dojo_items` ADD `depends_on_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `dojo_items` ADD `blocked_reason` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `dojo_items` ADD `github_branch` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `dojo_items` ADD `github_pr_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `dojo_items` ADD `ci_status` text DEFAULT 'none' NOT NULL;