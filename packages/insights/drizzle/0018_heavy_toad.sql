CREATE INDEX `idx_apiKey_hash_from` ON `edges` (`public_api_key`,`from`,`manifest_hash`);--> statement-breakpoint
CREATE INDEX `idx_hash_to` ON `edges` (`manifest_hash`,`to`);