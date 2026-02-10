UPDATE sessions SET status = 'idle' WHERE status = 'suspended';
--> statement-breakpoint
UPDATE sessions SET status = 'archived' WHERE status = 'deleted';
