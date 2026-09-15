CREATE TABLE `auditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorUserId` int NOT NULL,
	`resellerId` int,
	`action` varchar(80) NOT NULL,
	`target` varchar(160),
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`resellerId` int NOT NULL,
	`baseName` varchar(80) NOT NULL,
	`username` varchar(120) NOT NULL,
	`trafficGb` decimal(12,2) NOT NULL,
	`ipLimit` int NOT NULL DEFAULT 1,
	`expiresAt` timestamp NOT NULL,
	`status` enum('active','disabled','expired') NOT NULL DEFAULT 'active',
	`externalId` varchar(160),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clients_id` PRIMARY KEY(`id`),
	CONSTRAINT `clients_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `resellers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`displayName` varchar(160) NOT NULL,
	`suffixCode` varchar(24) NOT NULL,
	`creditGb` decimal(12,2) NOT NULL DEFAULT '0.00',
	`maxTrafficGb` decimal(12,2) NOT NULL DEFAULT '0.00',
	`maxDays` int NOT NULL DEFAULT 30,
	`maxIpLimit` int NOT NULL DEFAULT 1,
	`status` enum('active','suspended') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `resellers_id` PRIMARY KEY(`id`),
	CONSTRAINT `resellers_user_unique` UNIQUE(`userId`),
	CONSTRAINT `resellers_suffix_unique` UNIQUE(`suffixCode`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` varchar(160),
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE INDEX `audit_actor_idx` ON `auditLogs` (`actorUserId`);--> statement-breakpoint
CREATE INDEX `audit_reseller_idx` ON `auditLogs` (`resellerId`);--> statement-breakpoint
CREATE INDEX `clients_reseller_idx` ON `clients` (`resellerId`);