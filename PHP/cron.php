<?php
// collects the data from EyeWire (because the other hosting can't :/), sends the data to the other hosting and creates a backup in the local db
$db = new mysqli('host', 'user', 'password', 'db');

$toExport = [];

function collectTheData($type, $period) {
  global $db, $toExport;

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
      if ($period === 'weeks') {
        $entry['date'] = $date->format('Y') . '-' . $date->format('W'); // yyyy-ww
      }
      elseif ($period === 'months') {
        $entry['date'] = $date->format('Y') . '-' . $date->format('m'); // yyyy-mm
      }
			$inserts[] = "({$entry->id}, '{$entry->country}', {$entry->points}, '{$entry->date}')"; // $entry->points for both cases, because that's how it's in the JSON
		}
		$insert .= implode(',', $inserts) . " ON DUPLICATE KEY UPDATE {$type} = VALUES({$type})";
		$db->query($insert);
    if ($db->errno) {
      echo $db->error;
    }
	}
	catch (Exception $e) {echo $e->getMessage();
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
