CREATE TABLE `environments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sandbox_type` text NOT NULL,
	`config` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `sessions` ADD `environment_id` text REFERENCES environments(id);--> statement-breakpoint
ALTER TABLE `sessions` ADD `sandbox_image_digest` text;