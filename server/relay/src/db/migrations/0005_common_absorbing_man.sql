CREATE TABLE `secrets_new` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`env_var` text NOT NULL,
	`kind` text DEFAULT 'env_var' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`iv` text NOT NULL,
	`ciphertext` text NOT NULL,
	`tag` text NOT NULL,
	`key_version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);--> statement-breakpoint
INSERT INTO `secrets_new` (`id`, `name`, `env_var`, `kind`, `enabled`, `iv`, `ciphertext`, `tag`, `key_version`, `created_at`, `updated_at`)
SELECT `id`, `name`, UPPER(`id`), 'ai_provider', 1, `iv`, `ciphertext`, `tag`, `key_version`, `created_at`, `updated_at`
FROM `secrets`;--> statement-breakpoint
DROP TABLE `secrets`;--> statement-breakpoint
ALTER TABLE `secrets_new` RENAME TO `secrets`;--> statement-breakpoint
CREATE UNIQUE INDEX `secrets_env_var_idx` ON `secrets` (`env_var`);
