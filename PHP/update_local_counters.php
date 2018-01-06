<?php
require '../credentials/pass.php';

$pdo = new PDO(
  "mysql:host={$host};dbname={$dbname}", $user, $pass,
  [PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

$uid = $_GET['uid'];

if (!is_numeric($uid)) {
  return json_encode([
    'result' => 'failed',
    'msg' => 'Incorrect user id'
  ]);
}

date_default_timezone_set('America/New_York');

$ISOLeapYears = [2015, 2020, 2026, 2032, 2037, 2043, 2048, 2054, 2060, 2065, 2071, 2076, 2082, 2088, 2093, 2099, 2105];

function week_USStyle($date) {
  global $ISOLeapYears;

  $currentWeek = $date->format('W');
  $currentYear = $date->format('Y');

  if ($date->format('l') === 'Sunday') {
    ++$currentWeek;
    // source: http://henry.pha.jhu.edu/calendarDir/newton.html
    
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

$currentWeekNum = week_USStyle(new DateTime());

$currentDate = date('Y-m-d');
$currentWeek = date('Y') . '-' . $currentWeekNum;
$currentMonth = date('Y-m');
$currentYear = date('Y');

$previousDay = date('Y-m-d', strtotime('yesterday'));
// $previousWeek = date('Y-W', strtotime('last week'));
$previousMonth = date('Y-m', strtotime('last month'));
$previousYear = $currentYear - 1;

$previousWeekNum = $currentWeekNum - 1;

if ($previousWeekNum === 0) {
  if (!in_array($previousYear)) {
    $previousWeekNum = 52;
  }
  else {
    $previousWeekNum = 53;
  }
}

$previousWeek = $previousYear . '-' . $previousWeekNum;

function emptyResult() {
  return [
    'value' => null,
    'date' => null
  ];
}

function getPreviousResults() {
  global $pdo, $uid;
  
  $res = [];

  $result = $pdo->query("CALL get_last({$uid})");
  if (!result) {
    return false;
  }

  while ($row = $result->fetch()) {
    $res[$row['period']] = [
      'points' => [
        'value' => is_null($row['points']) ? null : (int) $row['points'],
        'date' => null
      ],
      'cubes' => [
        'value' => is_null($row['cubes']) ? null : (int) $row['cubes'],
        'date' => null
      ],
      'trailblazes' => [
        'value' => is_null($row['trailblazes']) ? null : (int) $row['trailblazes'],
        'date' => null
      ],
      'scythes' => [
        'value' => is_null($row['scythes']) ? null : (int) $row['scythes'],
        'date' => null
      ],
      'completes' => [
        'value' => is_null($row['completes']) ? null : (int) $row['completes'],
        'date' => null
      ],
      'date' => $row['date']
    ];
  }

  return $res;
}


function getBestResults() {
  global $pdo, $uid;
  
  $res = [];
  
  $result = $pdo->query("CALL get_best({$uid})");
  
  if (!result) {
    return false;
  }

  while ($row = $result->fetch()) {
    $res[$row['period']][$row['category']] = [
      'value' =>  is_null($row['value']) ? null : (int) $row['value'],
      'date' => $row['date']
    ];
  }

  return $res;
}


function getCharts() {
  global $pdo, $uid;
  
  $res = [];
  
  $result = $pdo->query("CALL get_charts({$uid})");
  if (!result) {
    return false;
  }
  
  while ($row = $result->fetch()) {
    $res[$row['period']][$row['date']] = [
      'points' => is_null($row['points']) ? null : (int) $row['points'],
      'cubes' => is_null($row['cubes']) ? null : (int) $row['cubes'],
      'trailblazes' => is_null($row['trailblazes']) ? null : (int) $row['trailblazes'],
      'scythes' => is_null($row['scythes']) ? null : (int) $row['scythes'],
      'completes' => is_null($row['completes']) ? null : (int) $row['completes']
    ];
  }

  return $res;
}

$result = [
  'result' => 'ok',
  'currentDate' => $currentDate
];

if ($_GET['previous'] && $_GET['previous'] === '1') {
  $result['previous'] = getPreviousResults();
}

if ($_GET['best'] && $_GET['best'] === '1') {
  $result['best'] = getBestResults();
}

if ($_GET['charts'] && $_GET['charts'] === '1') {
  $result['charts'] = getCharts();
}

echo json_encode($result);
