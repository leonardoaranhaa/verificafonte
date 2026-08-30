CREATE TABLE `case_source_moments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`caseId` int NOT NULL,
	`role` enum('original','viral_distorcido','contextual') NOT NULL DEFAULT 'original',
	`mediaKind` enum('video','audio','post','documento','outro') NOT NULL DEFAULT 'video',
	`title` text NOT NULL,
	`url` text NOT NULL,
	`sourceName` varchar(240) NOT NULL,
	`timestampStartSec` int,
	`timestampEndSec` int,
	`eventDate` timestamp,
	`quoteAtMoment` text,
	`distortionDescription` text,
	`linkedOriginalMomentId` int,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `case_source_moments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `case_source_moments_case_idx` ON `case_source_moments` (`caseId`);--> statement-breakpoint
CREATE INDEX `case_source_moments_role_idx` ON `case_source_moments` (`role`);