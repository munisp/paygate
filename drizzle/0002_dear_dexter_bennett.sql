CREATE TABLE `named_alert_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`metric` varchar(64) NOT NULL,
	`target` varchar(128) NOT NULL,
	`severity` enum('warn','critical') NOT NULL,
	`threshold` int NOT NULL,
	`enabled` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `named_alert_rules_id` PRIMARY KEY(`id`)
);
