<?php
require '../credentials/pass.php';

$pdo = new PDO(
  "mysql:host={$host};dbname={$dbname}", $user, $pass,
  [PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

date_default_timezone_set('America/New_York');
$type = $_GET['type']; // points, cubes, people
$range = $_GET['custom_range_type']; // day, week, month, custom
$date = $_GET['date'];

function daysInMonth($year, $month) {
  if (in_array($month, ['04', '06', '09', '11'])) {
    return 30;
  }
  if ($month === '02') {
    // source: https://stackoverflow.com/a/5680167
    return date('L', strtotime($year)) ? 29 : 28;
  }
  return 31;
}

switch ($range) {
  case 'day':
    $result = $pdo->query("CALL get_custom_time('{$type}', '{$date}', '{$date}')");
    break;
  
  case 'week':
    // $date[0] = week no (yyyy-ww)
    // $date[1] = yyyy-mm-dd begin of the week
    // $date[2] = yyyy-mm-dd end of the week
    $date = explode('|', $date);
    $result = $pdo->query("CALL get_custom_time('{$type}', '{$date[1]}', '{$date[2]}')");
    break;

  case 'month':
    // $date in format yyyy-mm
    $date1 = $date . '-01';
    $dateExploded = explode('-', $date);
    $date2 = $date . '-' . daysInMonth($dateExploded[0], $dateExploded[1]);
    $result = $pdo->query("CALL get_custom_time('{$type}', '{$date1}', '{$date2}')");
    break;
  
  case 'custom':
   // $date[0] = yyyy-mm-dd begin of the period
   // $date[1] = yyyy-mm-dd end of the period
    $date = explode('|', $date);
    $result = $pdo->query("CALL get_custom_time('{$type}', '{$date[0]}', '{$date[1]}')");
  break;
}

if (!$result) {
  var_dump($pdo->errorInfo());
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
