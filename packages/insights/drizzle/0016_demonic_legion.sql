DROP INDEX IF EXISTS `edgeIndex_PublicApiKey_manifestHash`;--> statement-breakpoint
DROP INDEX IF EXISTS `edgeIndex`;--> statement-breakpoint
CREATE INDEX `idx_edge_publicApiKey_manifestHash` ON `edges` (`public_api_key`,`manifest_hash`);--> statement-breakpoint
CREATE INDEX `idx_edge_apiKey_manifestHash_from_to` ON `edges` (`public_api_key`,`manifest_hash`,`from`,`to`);--> statement-breakpoint
DROP INDEX IF EXISTS `hashIndex`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_manifests_apiKey_hash` ON `manifests` (`hash`,`public_api_key`);--> statement-breakpoint
CREATE INDEX `idx_manifests_public_apiKey` ON `manifests` (`public_api_key`);--> statement-breakpoint
CREATE INDEX `idx_manifests_hash` ON `manifests` (`hash`);--> statement-breakpoint
CREATE INDEX `idx_routes_publicApiKey_manifestHash` ON `routes` (`public_api_key`,`manifest_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_symbolDetail_apiKey_manifestHash` ON `symbolDetail` (`public_api_key`,`manifest_hash`);