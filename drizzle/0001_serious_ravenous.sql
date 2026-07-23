CREATE TABLE `dojo_bridge_clients` (
	`workspace_id` text NOT NULL,
	`client_id` text NOT NULL,
	`display_name` text NOT NULL,
	`version` text,
	`last_seen` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `client_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `dojo_workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `dojo_bridge_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`action` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`result_json` text,
	`error_text` text,
	`client_id` text,
	`created_at` text NOT NULL,
	`claimed_at` text,
	`completed_at` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `dojo_workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
