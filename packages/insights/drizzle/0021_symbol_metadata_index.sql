DROP INDEX IF EXISTS `idx_symbolDetail_apiKey_manifestHash`;--> statement-breakpoint
DELETE FROM `symbolDetail`
WHERE `public_api_key` IS NOT NULL AND `manifest_hash` IS NOT NULL
  AND `id` NOT IN (
    SELECT max(`id`) FROM `symbolDetail`
    GROUP BY `public_api_key`, `manifest_hash`, `hash`
  );--> statement-breakpoint
CREATE UNIQUE INDEX `idx_symbolDetail_apiKey_manifestHash_hash` ON `symbolDetail` (`public_api_key`,`manifest_hash`,`hash`);
