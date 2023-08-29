CREATE TABLE `applications` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`public_api_key` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `symbols` (
	`id` integer PRIMARY KEY NOT NULL,
	`public_api_key` text,
	`pathname` text NOT NULL,
	`interaction` integer NOT NULL,
	`symbol` text NOT NULL,
	`session_id` text NOT NULL,
	`prev_symbol` text,
	`time_delta_ms` integer NOT NULL,
	FOREIGN KEY (`public_api_key`) REFERENCES `applications`(`public_api_key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publicApiKeyIndex` ON `applications` (`public_api_key`);