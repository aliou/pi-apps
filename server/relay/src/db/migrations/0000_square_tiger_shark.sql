CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`seq` integer NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_session_seq_idx` ON `events` (`session_id`,`seq`);--> statement-breakpoint
CREATE INDEX `events_session_created_idx` ON `events` (`session_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `repos` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`full_name` text NOT NULL,
	`owner` text NOT NULL,
	`is_private` integer DEFAULT false NOT NULL,
	`description` text,
	`html_url` text,
	`clone_url` text,
	`ssh_url` text,
	`default_branch` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`status` text DEFAULT 'creating' NOT NULL,
	`repo_id` text,
	`repo_path` text,
	`branch_name` text,
	`name` text,
	`current_model_provider` text,
	`current_model_id` text,
	`system_prompt` text,
	`created_at` text NOT NULL,
	`last_activity_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
