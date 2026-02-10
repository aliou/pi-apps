CREATE TABLE `extension_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`session_id` text,
	`package` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `extension_configs_scope_session_package_idx` ON `extension_configs` (`scope`,`session_id`,`package`);--> statement-breakpoint
CREATE INDEX `extension_configs_session_idx` ON `extension_configs` (`session_id`);--> statement-breakpoint
ALTER TABLE `sessions` ADD `extensions_stale` integer DEFAULT false NOT NULL;