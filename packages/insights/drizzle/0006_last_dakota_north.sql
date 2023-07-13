CREATE TABLE `manifests` (
	`id` integer PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE symbolDetail ADD `manifest_hash` text REFERENCES manifests(hash);--> statement-breakpoint
ALTER TABLE symbolDetail ADD `lo` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE symbolDetail ADD `hi` integer NOT NULL DEFAULT 0;--> statement-breakpoint
CREATE INDEX `edgeIndex_PublicApiKey` ON `edges` (`public_api_key`);--> statement-breakpoint
CREATE INDEX `edgeIndex_PublicApiKey_manifestHash` ON `edges` (`public_api_key`,`manifest_hash`);