<?php
require '../credentials/pass.php';

$pdo = new PDO(
  "mysql:host={$localhost};dbname={$dbname}", $user, $pass,
  [PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

$toExport = [];

function collectTheData($type, $period) {
  global $pdo, $toExport;

  $insert = 'INSERT INTO ' . $period . 's (uid, country, ' . $type . ', date) VALUES ';
  $inserts = array();
	try {
		$JSON = file_get_contents('https://eyewire.org/1.0/stats/top/players/by/' . $type . '/per/' . $period);
		if (!$JSON) {
			return false;
		}

		$data = json_decode($JSON);
    $toExport[$period][$type] = $data;
		if ($data === NULL || json_last_error() !== JSON_ERROR_NONE) { // we don't need a valid JSON with NULL as its value
			return false;
		}

		foreach ($data as $entry) {
      $date = new DateTime($entry->date);
      if ($period === 'week') {
        $entry->date = $date->format('Y') . '-' . $date->format('W'); // yyyy-ww
      }
      elseif ($period === 'month') {
        $entry->date = $date->format('Y') . '-' . $date->format('m'); // yyyy-mm
      }
			$inserts[] = "({$entry->id}, '{$entry->country}', {$entry->points}, '{$entry->date}')"; // $entry->points for both cases, because that's how it's in the JSON
		}
		$insert .= implode(',', $inserts) . " ON DUPLICATE KEY UPDATE {$type} = VALUES({$type})";

		$result = $pdo->exec($insert);
    if ($result === false) {
      var_dump($pdo->errorInfo());
      return false;
    }
	}
	catch (Exception $e) {
		// nothing to do here, just try to collect the rest of the data
	}
}

date_default_timezone_set('America/New_York');

collectTheData('points', 'day');
collectTheData('cubes', 'day');

$lastDayOfWeek = date('D') === 'Sat';
$lastDayOfMonth = date('d') === date('t');

if ($lastDayOfWeek) {
	collectTheData('points', 'week');
	collectTheData('cubes', 'week');
}

if ($lastDayOfMonth) {
	collectTheData('points', 'month');
	collectTheData('cubes', 'month');
}
