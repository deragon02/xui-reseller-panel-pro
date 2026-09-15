CREATE TABLE `resellerInboundAccess` (
	`id` int AUTO_INCREMENT NOT NULL,
	`resellerId` int NOT NULL,
	`inboundId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `resellerInboundAccess_id` PRIMARY KEY(`id`),
	CONSTRAINT `reseller_inbound_access_unique` UNIQUE(`resellerId`,`inboundId`)
);
--> statement-breakpoint
CREATE TABLE `resellerNodeAccess` (
	`id` int AUTO_INCREMENT NOT NULL,
	`resellerId` int NOT NULL,
	`nodeId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `resellerNodeAccess_id` PRIMARY KEY(`id`),
	CONSTRAINT `reseller_node_access_unique` UNIQUE(`resellerId`,`nodeId`)
);
--> statement-breakpoint
CREATE TABLE `xuiInbounds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nodeId` int NOT NULL,
	`remoteId` int NOT NULL,
	`remark` varchar(180) NOT NULL,
	`protocol` varchar(40),
	`port` int,
	`settingsJson` text,
	`streamSettingsJson` text,
	`active` boolean NOT NULL DEFAULT true,
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `xuiInbounds_id` PRIMARY KEY(`id`),
	CONSTRAINT `xui_inbounds_remote_unique` UNIQUE(`nodeId`,`remoteId`)
);
--> statement-breakpoint
CREATE TABLE `xuiNodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`baseUrl` varchar(500) NOT NULL,
	`apiTokenEncrypted` text NOT NULL,
	`status` enum('active','error','disabled') NOT NULL DEFAULT 'active',
	`lastSyncAt` timestamp,
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `xuiNodes_id` PRIMARY KEY(`id`),
	CONSTRAINT `xui_nodes_url_unique` UNIQUE(`baseUrl`)
);
--> statement-breakpoint
ALTER TABLE `clients` ADD `nodeId` int;--> statement-breakpoint
ALTER TABLE `clients` ADD `inboundId` int;--> statement-breakpoint
CREATE INDEX `xui_inbounds_node_idx` ON `xuiInbounds` (`nodeId`);