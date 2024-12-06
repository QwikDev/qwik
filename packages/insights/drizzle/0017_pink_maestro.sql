CREATE INDEX `idx_manifests_apiKey_hash_2` ON `manifests` (`public_api_key`,`hash`);--> statement-breakpoint
CREATE INDEX `idx_manifest_api_timestamp` ON `manifests` (`public_api_key`,`timestamp`);