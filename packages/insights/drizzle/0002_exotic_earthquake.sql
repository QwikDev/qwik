CREATE TABLE `errors` (
	`id` integer PRIMARY KEY NOT NULL,
	`public_api_key` text,
	`session_id` text NOT NULL,
	`url` text NOT NULL,
	`source` text NOT NULL,
	`line` integer NOT NULL,
	`column` integer NOT NULL,
	`message` text NOT NULL,
	`error` text NOT NULL,
	`stack` text NOT NULL,
	FOREIGN KEY (`public_api_key`) REFERENCES `applications`(`public_api_key`) ON UPDATE no action ON DELETE no action
);
