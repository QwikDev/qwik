CREATE TABLE `symbolDetailTmp` (
	`id` integer PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`public_api_key` text,
	`manifest_hash` text,
	`full_name` text NOT NULL,
	`origin` text NOT NULL,
	`lo` integer NOT NULL,
	`hi` integer NOT NULL,
	FOREIGN KEY (`public_api_key`) REFERENCES `applications`(`public_api_key`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`public_api_key`,`manifest_hash`) REFERENCES `manifests`(`public_api_key`,`hash`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `symbolDetailTmp` (
	`hash`,
	`public_api_key`,
	`manifest_hash`,
	`full_name`,
	`origin`,
	`lo`,
	`hi`
) SELECT 
	`hash`,
	`public_api_key`,
	`manifest_hash`,
	`full_name`,
	`origin`,
	`lo`,
	`hi`
 FROM `symbolDetail`;--> statement-breakpoint
DROP TABLE `symbolDetail`;--> statement-breakpoint
ALTER TABLE `symbolDetailTmp` RENAME TO `symbolDetail`;