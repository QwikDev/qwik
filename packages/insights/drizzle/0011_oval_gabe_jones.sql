CREATE TABLE `routes` (
	`id` integer PRIMARY KEY NOT NULL,
	`public_api_key` text,
	`manifest_hash` text NOT NULL,
	`route` text NOT NULL,
	`symbol` text NOT NULL,
	`interactions` integer NOT NULL,
	`timeline` integer NOT NULL,
	FOREIGN KEY (`public_api_key`) REFERENCES `applications`(`public_api_key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `routeIndex_Symbol` ON `routes` (`public_api_key`,`manifest_hash`,`route`,`symbol`);