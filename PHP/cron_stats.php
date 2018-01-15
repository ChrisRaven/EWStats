<?php
require '../credentials/pass.php';

date_default_timezone_set('America/New_York');
$yesterday = date('Y-m-d', strtotime('yesterday'));

$pdo = new PDO(
  "mysql:host={$host};dbname={$dbname}", $user, $pass,
  [PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

function collectTheData($type) {
  global $pdo, $yesterday;

	try {
		$JSON = file_get_contents("https://eyewire.org/1.0/stats/top/user/by/{$type}/per/day?from={$yesterday}&to={$yesterday}");
		if (!$JSON) {
			return false;
		}

    if ($type === 'complete') {
      $type .= 's';
    }

    $query1 = "INSERT INTO results (uid, date, {$type}) VALUES ";
    $query2 = "INSERT IGNORE INTO users (uid, name, country_code) VALUES ";
    $inserts1 = [];
    $inserts2 = [];

		$data = json_decode($JSON);

		foreach ($data as $entry) {
			$inserts1[] = "({$entry->id}, '{$entry->date}', {$entry->points})"; // $entry->points for every case, because that's how it's in the JSON
      $inserts2[] = "({$entry->id}, '{$entry->username}', '{$entry->country}')";
		}
		$query1 .= implode(',', $inserts1) . " ON DUPLICATE KEY UPDATE {$type} = VALUES({$type})";
    $query2 .= implode(',', $inserts2);

		$result = $pdo->exec($query1);
    if ($result === false) {
      var_dump($pdo->errorInfo());
      return false;
    }

		$result = $pdo->exec($query2);
    if ($result === false) {
      var_dump($pdo->errorInfo());
      return false;
    }
	}
	catch (Exception $e) {
		// nothing to do here, just try to collect the rest of the data
	}
}

collectTheData('points');
collectTheData('cubes');
collectTheData('trailblazes');
collectTheData('scouts');
collectTheData('scythes');
collectTheData('complete');
