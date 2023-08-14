DROP INDEX IF EXISTS `hashIndex`;--> statement-breakpoint
CREATE UNIQUE INDEX `hashIndex` ON `manifests` (`hash`,`public_api_key`);