ALTER TABLE `clients` ADD `usedTrafficGb` decimal(12,4) DEFAULT '0.0000' NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `lastTrafficSyncAt` timestamp;