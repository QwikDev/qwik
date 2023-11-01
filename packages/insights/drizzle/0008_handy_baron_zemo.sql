ALTER TABLE manifests ADD `public_api_key` text REFERENCES applications(public_api_key);
