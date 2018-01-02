<?php
require '../credentials/pass.php';

$pdo = new PDO(
  "mysql:host={$localhost};dbname={$dbname}", $user, $pass,
  [PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

date_default_timezone_set('America/New_York');
$type = $_GET['type']; // points, cubes, people
$range = $_GET['custom_range_type']; // day, week, month, custom
$date = $_GET['date'];

switch ($range) {
  case 'day':
    $result = $pdo->query("CALL get_day('{$type}', '{$date}')");
    break;
  
  case 'week':
    // $date[0] = week no
    // $date[1] = yyyy-mm-dd begin of the week
    // $date[2] = yyyy-mm-dd end of the week
    $date = explode('|', $date);
    $result = $pdo->query("CALL get_week('{$type}', '{$date[0]}')");
    break;

  case 'month':
    $result = $pdo->query("CALL get_month('{$type}', '{$date}')");
    break;
  
  case 'custom':
   // $date[0] = yyyy-mm-dd begin of the period
   // $date[1] = yyyy-mm-dd end of the period
    $date = explode('|', $date);
    $result = $pdo->query("CALL get_custom_period('{$type}', '{$date[0]}', '{$date[1]}')");
  break;
}

if (!$result) {
  return false;
}

$res = [];

while ($row = $result->fetch()) {
  $res[] = [
    'points' => (int)$row['points'],
    'country' => $row['country'] ? $row['country'] : ' ',
    'username' => $row['name'] ? $row['name'] : ' '
  ];
};

echo json_encode($res);
/*
[{"points":25581,"country":"us"},
*/