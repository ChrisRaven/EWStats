<?php
$db = new mysqli('host', 'user', 'password', 'db');

$data = $_POST['data'];
$data = json_decode($data);
$uid = $_POST['uid'];

date_default_timezone_set('America/New_York');

$currentWeek = date('W');
$currentMonth = date('m');
$currentYear = date('Y');


function collectTheData($period, $data, $date) {
  global $db, $uid;
  try {
    $db->query("
      INSERT INTO per_{$period} VALUES (
        {$uid},
        {$data->{$period}->trailblazed},
        {$data->{$period}->scythed},
        {$data->{$period}->completed},
        '{$date}'
      ) ON DUPLICATE KEY UPDATE
      trailblazes=GREATEST(trailblazes, VALUES(trailblazes)),
      scythes=GREATEST(scythes, VALUES(scythes)),
      completes=GREATEST(completes, VALUES(completes))
    ");
    
    if ($db->errno) {
      echo $db->error;
    }
  }
  catch (Exception $e) {
    echo $e->getMessage();
  }
}


// loop in case, there was some problem with the stats server not collecting the data
// usually there should be only one step in the loop
if ($data) {
  while ($entry = current($data)) {
    $date = key($data);
    $dateFromData = new DateTime($date);

    $weekFromData = $dateFromData->format('W');
    $monthFromData = $dateFromData->format('m');
    $yearFromData = $dateFromData->format('Y');

    collectTheData('day', $entry, $date);

    if ($currentWeek !== $weekFromData || $currentYear !== $yearFromData) {
      collectTheData('week', $entry, $yearFromData . '-' . $weeekFromData);
    }

    if ($currentMonth !== $monthFromData || $currentYear !== $yearFromData) {
      collectTheData('month', $entry, $yearFromData . '-' . $monthFromData);
    }

    next($data);
  }
}

echo 'ok';
