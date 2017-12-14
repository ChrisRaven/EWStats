-- phpMyAdmin SQL Dump
-- version 4.7.3
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Generation Time: Dec 14, 2017 at 11:13 AM
-- Server version: 5.6.38
-- PHP Version: 5.6.30

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `ewstats_ewstats`
--

DELIMITER $$
--
-- Procedures
--
CREATE DEFINER=`ewstats`@`localhost` PROCEDURE `get_best` (IN `in_uid` INT UNSIGNED)  READS SQL DATA
BEGIN
-- all second columns names as n, because otherwise ORDER BY was sorting by that column (because its value is the same as the names of corresponding third columns)
DROP TEMPORARY TABLE IF EXISTS results;
CREATE TEMPORARY TABLE results (
    period VARCHAR(5),
    category VARCHAR(20),
    value INT UNSIGNED,
    date VARCHAR(10)
);

INSERT INTO results (period, category, value, date)
  (SELECT 'day', 'points' as n, points, date
    FROM days
    WHERE uid = in_uid
    ORDER BY points DESC, date ASC
    LIMIT 1)

  UNION ALL

  (SELECT 'day', 'cubes' as n, cubes, date
    FROM days
    WHERE uid = in_uid
    ORDER BY cubes DESC, date ASC
    LIMIT 1)

  UNION ALL
    
  (SELECT 'day', 'trailblazes' as n, trailblazes, date
    FROM per_day
    WHERE uid = in_uid
    ORDER BY trailblazes DESC, date ASC
    LIMIT 1)
    
  UNION ALL

  (SELECT 'day', 'scythes' as n, scythes, date
    FROM per_day
    WHERE uid = in_uid
    ORDER BY scythes DESC, date ASC
    LIMIT 1)

  UNION ALL
  
  (SELECT 'day', 'completes' as n, completes, date
    FROM per_day
    WHERE uid = in_uid
    ORDER BY completes DESC, date ASC
    LIMIT 1)



  UNION ALL

(SELECT 'week', 'points' as n, points, date
    FROM weeks
    WHERE uid = in_uid
    ORDER BY points DESC, date ASC
    LIMIT 1)

  UNION ALL

  (SELECT 'week', 'cubes' as n, cubes, date
    FROM weeks
    WHERE uid = in_uid
    ORDER BY cubes DESC, date ASC
    LIMIT 1)

  UNION ALL
    
  (SELECT 'week', 'trailblazes' as n, trailblazes, date
    FROM per_week
    WHERE uid = in_uid
    ORDER BY trailblazes DESC, date ASC
    LIMIT 1)
    
  UNION ALL

  (SELECT 'week', 'scythes' as n, scythes, date
    FROM per_week
    WHERE uid = in_uid
    ORDER BY scythes DESC, date ASC
    LIMIT 1)

  UNION ALL
  
  (SELECT 'week', 'completes' as n, completes, date
    FROM per_week
    WHERE uid = in_uid
    ORDER BY completes DESC, date ASC
    LIMIT 1)



  UNION ALL

  (SELECT 'month', 'points' as n, points, date
    FROM months
    WHERE uid = in_uid
    ORDER BY points DESC, date ASC
    LIMIT 1)

  UNION ALL

  (SELECT 'month', 'cubes' as n, cubes, date
    FROM months
    WHERE uid = in_uid
    ORDER BY cubes DESC, date ASC
    LIMIT 1)

  UNION ALL
    
  (SELECT 'month', 'trailblazes' as n, trailblazes, date
    FROM per_month
    WHERE uid = in_uid
    ORDER BY trailblazes DESC, date ASC
    LIMIT 1)
    
  UNION ALL

  (SELECT 'month', 'scythes' as n, scythes, date
    FROM per_month
    WHERE uid = in_uid
    ORDER BY scythes DESC, date ASC
    LIMIT 1)

  UNION ALL
  
  (SELECT 'month', 'completes' as n, completes, date
    FROM per_month
    WHERE uid = in_uid
    ORDER BY completes DESC, date ASC
    LIMIT 1);

SELECT * FROM results;

END$$

CREATE DEFINER=`ewstats`@`localhost` PROCEDURE `get_charts` (IN `in_uid` INT UNSIGNED)  READS SQL DATA
BEGIN

DROP TEMPORARY TABLE IF EXISTS results;
CREATE TEMPORARY TABLE results(
    period VARCHAR(6),
    points INT UNSIGNED NULL,
    cubes INT UNSIGNED NULL,
    trailblazes INT UNSIGNED NULL,
    scythes INT UNSIGNED NULL,
    completes INT UNSIGNED NULL,
    date VARCHAR(10),
    UNIQUE KEY date (date)
);


-- 7 days
INSERT INTO results(period, points, cubes, date)
SELECT 'days', points, cubes, date
  FROM days
  WHERE uid = in_uid
    AND date > NOW() - INTERVAL 7 DAY
  ON DUPLICATE KEY UPDATE
    points = VALUES(points),
    cubes = VALUES(cubes);

INSERT INTO results(period, trailblazes, scythes, completes, date)
SELECT 'days', trailblazes, scythes, completes, date
  FROM per_day
  WHERE uid = in_uid
    AND date > NOW() - INTERVAL 7 DAY
  ON DUPLICATE KEY UPDATE
    trailblazes = VALUES(trailblazes),
    scythes = VALUES(scythes),
    completes = VALUES(completes);



-- 10 weeks    
INSERT INTO results(period, points, cubes, date)
SELECT 'weeks', points, cubes, date
  FROM weeks
  WHERE uid = in_uid
    AND date > DATE_FORMAT(NOW() - INTERVAL 10 WEEK, '%X-%V')
  ON DUPLICATE KEY UPDATE
    points = VALUES(points),
    cubes = VALUES(cubes);

INSERT INTO results(period, trailblazes, scythes, completes, date)
SELECT 'weeks', trailblazes, scythes, completes, date
  FROM per_week
  WHERE uid = in_uid
    AND date > DATE_FORMAT(NOW() - INTERVAL 10 WEEK, '%X-%V')
  ON DUPLICATE KEY UPDATE
    trailblazes = VALUES(trailblazes),
    scythes = VALUES(scythes),
    completes = VALUES(completes);

    
-- 12 months    
INSERT INTO results(period, points, cubes, date)
SELECT 'months', points, cubes, date
  FROM months
  WHERE uid = in_uid
    AND date > DATE_FORMAT(NOW() - INTERVAL 12 MONTH, '%Y-%m')
  ON DUPLICATE KEY UPDATE
    points = VALUES(points),
    cubes = VALUES(cubes);

INSERT INTO results(period, trailblazes, scythes, completes, date)
SELECT 'months', trailblazes, scythes, completes, date
  FROM per_month
  WHERE uid = in_uid
    AND date > DATE_FORMAT(NOW() - INTERVAL 12 MONTH, '%Y-%m')
  ON DUPLICATE KEY UPDATE
    trailblazes = VALUES(trailblazes),
    scythes = VALUES(scythes),
    completes = VALUES(completes);

SELECT * FROM results
  ORDER BY 
    FIELD(period,'days','weeks','months'),
    date ASC;

END$$

CREATE DEFINER=`ewstats`@`localhost` PROCEDURE `get_last` (IN `in_uid` INT UNSIGNED)  READS SQL DATA
BEGIN

DROP TEMPORARY TABLE IF EXISTS results;
CREATE TEMPORARY TABLE results(
  period VARCHAR(7),
  points INT UNSIGNED NULL,
  cubes INT UNSIGNED NULL,
  trailblazes INT UNSIGNED NULL,
  scythes INT UNSIGNED NULL,
  completes INT UNSIGNED NULL,
  date VARCHAR(10),
  UNIQUE KEY date (date)
);


-- yesterday
INSERT INTO results (period, points, cubes, date)
SELECT 'day', points, cubes, date
  FROM days
  WHERE uid = in_uid
    AND date = CURDATE() - INTERVAL 1 DAY
  ON DUPLICATE KEY UPDATE
    points = VALUES(points),
    cubes = VALUES(cubes);

INSERT INTO results (period, trailblazes, scythes, completes, date)
SELECT 'day', trailblazes, scythes, completes, date
  FROM per_day
  WHERE uid = in_uid
    AND date = CURDATE() - INTERVAL 1 DAY
  ON DUPLICATE KEY UPDATE
    trailblazes = VALUES(trailblazes),
    scythes = VALUES(scythes),
    completes = VALUES(completes);


-- last week
INSERT INTO results (period, points, cubes, date)
SELECT 'week', points, cubes, date
  FROM weeks
  WHERE uid = in_uid
    AND date = DATE_FORMAT(CURDATE() - INTERVAL 1 WEEK, '%X-%V')
  ON DUPLICATE KEY UPDATE
    points = VALUES(points),
    cubes = VALUES(cubes);

INSERT INTO results (period, trailblazes, scythes, completes, date)
SELECT 'week', trailblazes, scythes, completes, date
  FROM per_week
  WHERE uid = in_uid
    AND date = DATE_FORMAT(CURDATE() - INTERVAL 1 WEEK, '%X-%V')
  ON DUPLICATE KEY UPDATE
    trailblazes = VALUES(trailblazes),
    scythes = VALUES(scythes),
    completes = VALUES(completes);


-- last month
INSERT INTO results (period, points, cubes, date)
SELECT 'month', points, cubes, date
  FROM months
  WHERE uid = in_uid
    AND date = DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m')
  ON DUPLICATE KEY UPDATE
    points = VALUES(points),
    cubes = VALUES(cubes);

INSERT INTO results (period, trailblazes, scythes, completes, date)
SELECT 'month', trailblazes, scythes, completes, date
  FROM per_month
  WHERE uid = in_uid
    AND date = DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m')
  ON DUPLICATE KEY UPDATE
    trailblazes = VALUES(trailblazes),
    scythes = VALUES(scythes),
    completes = VALUES(completes);

SELECT * FROM results;

END$$

DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `days`
--

CREATE TABLE `days` (
  `uid` int(10) UNSIGNED NOT NULL,
  `country` char(2) DEFAULT NULL,
  `points` int(10) UNSIGNED DEFAULT '0',
  `cubes` int(10) UNSIGNED DEFAULT '0',
  `date` date NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `months`
--

CREATE TABLE `months` (
  `uid` int(10) UNSIGNED NOT NULL,
  `country` char(2) DEFAULT NULL,
  `points` int(10) UNSIGNED DEFAULT '0',
  `cubes` int(10) UNSIGNED DEFAULT '0',
  `date` char(7) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `per_day`
--

CREATE TABLE `per_day` (
  `uid` int(10) UNSIGNED NOT NULL,
  `trailblazes` int(10) UNSIGNED DEFAULT '0',
  `scythes` int(10) UNSIGNED DEFAULT '0',
  `completes` int(10) UNSIGNED DEFAULT '0',
  `date` date NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `per_month`
--

CREATE TABLE `per_month` (
  `uid` int(10) UNSIGNED NOT NULL,
  `trailblazes` int(10) UNSIGNED DEFAULT '0',
  `scythes` int(10) UNSIGNED DEFAULT '0',
  `completes` int(10) UNSIGNED DEFAULT '0',
  `date` char(7) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `per_week`
--

CREATE TABLE `per_week` (
  `uid` int(10) UNSIGNED NOT NULL,
  `trailblazes` int(10) UNSIGNED DEFAULT '0',
  `scythes` int(10) UNSIGNED DEFAULT '0',
  `completes` int(10) UNSIGNED DEFAULT '0',
  `date` char(7) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `weeks`
--

CREATE TABLE `weeks` (
  `uid` int(10) UNSIGNED NOT NULL,
  `country` char(2) DEFAULT NULL,
  `points` int(10) UNSIGNED DEFAULT '0',
  `cubes` int(10) UNSIGNED DEFAULT '0',
  `date` char(7) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `days`
--
ALTER TABLE `days`
  ADD PRIMARY KEY (`uid`,`date`),
  ADD KEY `country` (`country`),
  ADD KEY `points` (`points`),
  ADD KEY `cubes` (`cubes`),
  ADD KEY `date` (`date`);

--
-- Indexes for table `months`
--
ALTER TABLE `months`
  ADD PRIMARY KEY (`uid`,`date`),
  ADD KEY `country` (`country`),
  ADD KEY `points` (`points`),
  ADD KEY `cubes` (`cubes`),
  ADD KEY `cubes_2` (`cubes`),
  ADD KEY `date` (`date`);

--
-- Indexes for table `per_day`
--
ALTER TABLE `per_day`
  ADD PRIMARY KEY (`uid`,`date`);

--
-- Indexes for table `per_month`
--
ALTER TABLE `per_month`
  ADD PRIMARY KEY (`uid`,`date`);

--
-- Indexes for table `per_week`
--
ALTER TABLE `per_week`
  ADD PRIMARY KEY (`uid`,`date`);

--
-- Indexes for table `weeks`
--
ALTER TABLE `weeks`
  ADD PRIMARY KEY (`uid`,`date`),
  ADD KEY `country` (`country`),
  ADD KEY `points` (`points`),
  ADD KEY `cubes` (`cubes`),
  ADD KEY `date` (`date`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
