<?php
require '../credentials/pass.php';

$pdo = new PDO(
  "mysql:host={$localhost};dbname={$dbname}", $user, $pass,
  [PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

$data = $_POST['data'];
$data = json_decode($data);
$uid = $_POST['uid'];

date_default_timezone_set('America/New_York');


function week_USStyle($date) {
  $currentWeek = $date->format('W');
  $currentYear = $date->format('Y');

  if ($date->format('l') === 'Sunday') {
    ++$currentWeek;
    // source: http://henry.pha.jhu.edu/calendarDir/newton.html
    $ISOLeapYears = [2015, 2020, 2026, 2032, 2037, 2043, 2048, 2054, 2060, 2065, 2071, 2076, 2082, 2088, 2093, 2099, 2105];
    if ($currentWeek === 54) {
      $currentWeek = 1;
    }
    // some ISO years contain additional 53rd week
    elseif ($currentWeek === 53 AND !in_array($currentYear, $ISOLeapYears)) {
      $currentWeek = 1;
    }
  }

  return $currentWeek;
}

$currentDate = new DateTime();
$currentWeek = week_USStyle($currentDate);
$currentMonth = $currentDate->format('m');
$currentYear = $currentDate->format('Y');




function collectTheData($period, $data, $date) {
  global $pdo, $uid;

  $result = $pdo->exec("
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
  
  if ($result === false) {
    var_dump($pdo->errorInfo());
    return false;
  }
}


// loop in case, there was some problem with the stats server not collecting the data
// usually there should be only one step in the loop
if ($data) {
  while ($entry = current($data)) {
    $date = key($data);
    $dateFromData = new DateTime($date);

    $weekFromData = week_USStyle($dateFromData);
    $monthFromData = $dateFromData->format('m');
    $yearFromData = $dateFromData->format('Y');

    collectTheData('day', $entry, $date);

    if ($currentWeek !== $weekFromData || $currentYear !== $yearFromData) {
      collectTheData('week', $entry, $yearFromData . '-' . $weekFromData);
    }

    if ($currentMonth !== $monthFromData || $currentYear !== $yearFromData) {
      collectTheData('month', $entry, $yearFromData . '-' . $monthFromData);
    }

    next($data);
  }
}

echo 'ok';
