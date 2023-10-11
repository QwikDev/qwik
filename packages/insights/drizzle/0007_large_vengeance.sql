DROP INDEX IF EXISTS `edgeIndex_PublicApiKey`;--> statement-breakpoint
DROP INDEX IF EXISTS `edgeIndex_PublicApiKey_manifestHash`;--> statement-breakpoint
ALTER TABLE errors ADD `manifest_hash` text REFERENCES manifests(hash);--> statement-breakpoint
CREATE INDEX `edgeIndex_PublicApiKey` ON `edges` (`public_api_key`);--> statement-breakpoint
CREATE INDEX `edgeIndex_PublicApiKey_manifestHash` ON `edges` (`public_api_key`,`manifest_hash`);