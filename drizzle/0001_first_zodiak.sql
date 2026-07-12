CREATE TABLE `breach_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`metric` varchar(64) NOT NULL,
	`severity` enum('warn','critical') NOT NULL,
	`message` text NOT NULL,
	`value` int NOT NULL,
	`threshold` int NOT NULL,
	`acknowledged` int NOT NULL DEFAULT 0,
	`detectedAt` timestamp NOT NULL DEFAULT (now()),
	`acknowledgedAt` timestamp,
	CONSTRAINT `breach_events_id` PRIMARY KEY(`id`)
);
