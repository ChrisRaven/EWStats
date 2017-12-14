<?php

$db = new mysqli('host', 'user', 'password', 'db');

$uid = $_GET['uid'];

if (!is_numeric($uid)) {
  return json_encode([
    'result' => 'failed',
    'msg' => 'Incorrect user id'
  ]);
}

date_default_timezone_set('America/New_York');

$currentDate = date('Y-m-d');
$currentWeek = date('Y-W');
$currentMonth = date('Y-m');

$previousDay = date('Y-m-d', strtotime('yesterday'));
$previousWeek = date('Y-W', strtotime('last week'));
$previousMonth = date('Y-m', strtotime('last month'));

function emptyResult() {
  return [
    'value' => null,
    'date' => null
  ];
}

function getPreviousResults() {
  global $db, $uid;
  
  $res = [];
  
  $result = $db->query("CALL get_last({$uid})");
  if ($db->errno) {
    return false;
  }
  
  if ($result && $result->num_rows) {
    while ($row = $result->fetch_object()) {
      $res[$row->period] = [
        'points' => [
          'value' => is_null($row->points) ? null : (int) $row->points,
          'date' => null
        ],
        'cubes' => [
          'value' => is_null($row->cubes) ? null : (int) $row->cubes,
          'date' => null
        ],
        'trailblazes' => [
          'value' => is_null($row->trailblazes) ? null : (int) $row->trailblazes,
          'date' => null
        ],
        'scythes' => [
          'value' => is_null($row->scythes) ? null : (int) $row->scythes,
          'date' => null
        ],
        'completes' => [
          'value' => is_null($row->completes) ? null : (int) $row->completes,
          'date' => null
        ],
        'date' => $row->date
      ];
    }
    
    $result->close();
    return $res;
  }
    // source: http://php.net/manual/en/mysqli.multi-query.php#102837
    // and http://php.net/manual/en/mysqli.multi-query.php#113840
    while ($db->next_result()) {
      if (!$db->more_results()) {
        break;
      }
    }
  
  return false;
}


function getBestResults() {
  global $db, $uid;
  
  $res = [];
  
  $result = $db->query("CALL get_best({$uid})");
  if ($db->errno) {
    return false;
  }
  
  if ($result && $result->num_rows) {
    while ($row = $result->fetch_object()) {
      $res[$row->period][$row->category] = [
        'value' =>  is_null($row->value) ? null : (int) $row->value,
        'date' => $row->date
      ];
    }
    
    $result->close();
    return $res;
  }
  // source: http://php.net/manual/en/mysqli.multi-query.php#102837
  // and http://php.net/manual/en/mysqli.multi-query.php#113840
  while ($db->next_result()) {
    if (!$db->more_results()) {
      break;
    }
  }
  
  return false;
}


function getCharts() {
  global $db, $uid;
  
  $res = [];
  
  $result = $db->query("CALL get_charts({$uid})");
  if ($db->errno) {
    return false;
  }
  
  if ($result && $result->num_rows) {
    while ($row = $result->fetch_object()) {
      $res[$row->period][$row->date] = [
        'points' => is_null($row->points) ? null : (int) $row->points,
        'cubes' => is_null($row->cubes) ? null : (int) $row->cubes,
        'trailblazes' => is_null($row->trailblazes) ? null : (int) $row->trailblazes,
        'scythes' => is_null($row->scythes) ? null : (int) $row->scythes,
        'completes' => is_null($row->completes) ? null : (int) $row->completes
      ];
    }
    
    $result->close();
    return $res;
  }
  // source: http://php.net/manual/en/mysqli.multi-query.php#102837
  // and http://php.net/manual/en/mysqli.multi-query.php#113840
  while ($db->next_result()) {
    if (!$db->more_results()) {
      break;
    }
  }
  
  return false;
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

$db->close();

echo json_encode($result);
