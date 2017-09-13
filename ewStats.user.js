// ==UserScript==
// @name         EyeWire Statistics
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Shows daily, weekly and monthly statistics for EyeWire
// @author       Krzysztof Kruk
// @match        https://eyewire.org/
// @downloadURL  https://raw.githubusercontent.com/ChrisRaven/EWStats/master/ewStats.user.js
// @updateURL    https://raw.githubusercontent.com/ChrisRaven/EWStats/master/ewStats.meta.js
// @grant        GM_getResourceText
// @require      https://chrisraven.github.io/EWStats/jquery-jvectormap-2.0.3.min.js
// @require      https://chrisraven.github.io/EWStats/jquery-jvectormap-world-mill.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/Chart.js/2.6.0/Chart.min.js
// @resource     base_html https://chrisraven.github.io/EWStats/base.html
// @resource     countries https://chrisraven.github.io/EWStats/countries.json
// @resource     cubesPerDay https://chrisraven.github.io/EWStats/cubes_per_day.json
// @resource     cubesPerWeek https://chrisraven.github.io/EWStats/cubes_per_week.json
// @resource     cubesPerMonth https://chrisraven.github.io/EWStats/cubes_per_month.json
// @resource     pointsPerDay https://chrisraven.github.io/EWStats/points_per_day.json
// @resource     pointsPerWeek https://chrisraven.github.io/EWStats/points_per_week.json
// @resource     pointsPerMonth https://chrisraven.github.io/EWStats/points_per_month.json
// ==/UserScript==


(function() {
  'use strict';

  // STATS PANEL
  const
    TB_COLOR = 'lightgray',
    RP_COLOR = '#0066FF',
    SC_COLOR = 'pink',
    WT_0_COLOR = 'brown',
    WT_1_COLOR = 'red',
    WT_2_COLOR = 'orange',
    WT_3_COLOR = 'yellow',
    WT_4_COLOR = 'green';

  var
    DEBUG = false,

    panel,
    map, chart,
    dataType = 'points',
    timeRange = 'day',
    dataCurrentlyInUse,
    accuData = new Array(10);

  var countries = JSON.parse(GM_getResourceText('countries'));

  // DEBUG
  var cubesPerDay = JSON.parse(GM_getResourceText('cubesPerDay'));
  var cubesPerWeek = JSON.parse(GM_getResourceText('cubesPerWeek'));
  var cubesPerMonth = JSON.parse(GM_getResourceText('cubesPerMonth'));

  var pointsPerDay = JSON.parse(GM_getResourceText('pointsPerDay'));
  var pointsPerWeek = JSON.parse(GM_getResourceText('pointsPerWeek'));
  var pointsPerMonth = JSON.parse(GM_getResourceText('pointsPerMonth'));
  // /DEBUG

  function addCSSFile(path) {
    $("head").append('<link href="' + path + '" rel="stylesheet" type="text/css">');
  }

  addCSSFile('https://chrisraven.github.io/EWStats/EWStats.css');
  addCSSFile('https://chrisraven.github.io/EWStats/jquery-jvectormap-2.0.3.css');


  function addMenuItem() {
    var
      li, a, list;

    li = document.createElement('li');
    li.style.cursor = 'pointer';
    a = document.createElement('a');
    a.id = 'ewsLink';
    a.innerHTML = 'Stats';
    li.appendChild(a);
    list = document.getElementById('nav').getElementsByTagName('ul')[0];
    list.insertBefore(li, list.lastChild.previousSibling); // for some reason the last child (the "Challenge" button) isn't the last child)
  }


  function generateTableRow(position, flag, name, value, highlight) {
    return '<tr class="ewsRankingRow' + (highlight ? 'Highlight' : 'Normal') + '">' + // highlighting currently not used
        '<td>' + position + '</td>' +
        '<td>' + (flag == 'rd' ? '&nbsp;' : '<img src="https://eyewire.org/static/images/flags/' + flag + '.png">') + '</td>' +
        '<td><div class="ewsCountryNameWrapper">' + name + '</div></td>' +
        '<td>' + value + '</td>' +
      '</tr>';
  }


  function composeTable(data) {
    var
      position = 0,
      html = '';

    for (let el of data) {
      html += generateTableRow(++position, el.flag, el.name, el.value, el.highlight);
    }

    return '<table>' + html + '</table>';
  }

  function createTable(data, limit) {
    var
      tableData = [];

    var amountPerCountrySortedKeys = getSortedKeys(data);

    if (typeof limit === 'undefined') {
      limit = 10;
    }

     for (let index of amountPerCountrySortedKeys) {
       if (index !== 'RD' && index !== 'EU') {
         tableData.push({
           flag: index.toLowerCase(),
           name: countries[index.toLowerCase()],
           value: data[index],
           highlight: false
         });

         limit--;
       }

      if (!limit) break;
    }

    return composeTable(tableData);
  }

  function updateTable(data) {
    $('#ewsLeftCell').html(createTable(data));
  }

  function groupByCountry(data) {
    var country, grouped = [];

    if (dataType !== 'people') {
      for (let row of data) {
        country = row.country.toUpperCase();
        if (!grouped[country]) {
          grouped[country] = row.points;
        }
        else {
          grouped[country] += row.points;
        }
      }
    }
    else {
      for (let row of data) {
        country = row.country.toUpperCase();
        if (!grouped[country]) {
          grouped[country] = 1;
        }
        else {
          grouped[country]++;
        }
      }
    }

    return grouped;
  }

  function createMap() {
    $('#ewsWorldMap').vectorMap({
      map: 'world_mill',
      series: {
        regions: [{
          scale: ['#C8EEFF', '#0071A4'],
          normalizeFunction: 'polynomial'
        }]
      },
      onRegionTipShow: function (e, el, code) {
        var
          lbl,
          htmlRows = '',
          rowCounter = 0,
          lCode = code.toLowerCase();

        var value = map.series.regions[0].values[code];

        switch (dataType) {
          case 'cubes': lbl = 'cube'; break;
          case 'points': lbl = 'point'; break;
          case 'people': lbl = 'person'; break;
        }

        if (value != 1) {
          if (dataType === 'people') {
            lbl = 'people';
          }
          else {
            lbl += 's';
          }
        }

        for (let row of dataCurrentlyInUse) {
          if (row.country === lCode) {
            htmlRows += '<tr><td>' + row.username + '</td><td>' + (dataType !== 'people' ? row.points : '&nbsp;') + '</td></tr>';
            if (++rowCounter % 30 === 0) {
              htmlRows += '</table><table>';
            }
          }
        }

        if (htmlRows === '') {
          htmlRows = '<tr><td class="ews-world-map-tooltip-empty-row">';
          switch (dataType) {
            case 'points': htmlRows += 'No points earned by players from '; break;
            case 'cubes': htmlRows += 'No cubes traced by players from '; break;
            case 'people': htmlRows += 'No players from '; break;
          }
          htmlRows += map.regions[code].config.name + '</td></tr>';
        }

        el.html('<div>' +
          (code == 'rd' ? '' : '<img src="https://eyewire.org/static/images/flags/' + lCode + '.png">') +
          el.html() + ' - ' + (value === undefined ? 0 : value) + ' ' + lbl +'<hr>' +
            '<table>' + htmlRows + '</table>' +
          '</div>'
        );
      }
    });

    map = $('#ewsWorldMap').vectorMap('get', 'mapObject');
  }

  function updateMap(values) {
    var
      el, key,
      min = 1000, max = 0;

    for (key in values) {
      if (values.hasOwnProperty(key)) {
        el = values[key];
        if (el < min) {
          min = el;
        }
        if (el > max) {
          max = el;
        }
      }
    }

    // source: https://github.com/bjornd/jvectormap/issues/221#issuecomment-63071490
    map.params.series.regions[0].min = min;
    map.params.series.regions[0].max = max;
    map.series.regions[0].clear(); // if not cleared, the values, which aren't in the current set, remain from the previous set
    map.series.regions[0].setValues(values);
  }

  function createChart(label) {
      var ctx = document.getElementById("ewsChart").getContext('2d');
      chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          datasets: [{
            backgroundColor: [
              'rgba(87,  0, 218, 1)',
              'rgba(139, 1, 220, 1)',
              'rgba(192, 2, 223, 1)',
              'rgba(226, 2, 205, 1)',
              'rgba(228, 3, 155, 1)',
              'rgba(231, 4, 105, 1)',
              'rgba(233, 4,  54, 1)',
              'rgba(236, 9,   5, 1)',
              'rgba(239, 63,  6, 1)',
              'rgba(241, 118, 7, 1)'
            ],
            borderColor: [
              'rgba(87,  0, 218, 1)',
              'rgba(139, 1, 220, 1)',
              'rgba(192, 2, 223, 1)',
              'rgba(226, 2, 205, 1)',
              'rgba(228, 3, 155, 1)',
              'rgba(231, 4, 105, 1)',
              'rgba(233, 4,  54, 1)',
              'rgba(236, 9,   5, 1)',
              'rgba(239, 63,  6, 1)',
              'rgba(241, 118, 7, 1)'
            ],
            borderWidth: 1
          }]
        },
        options: {
          maintainAspectRatio: false,
          cutoutPercentage: 70,
          layout: {
            padding: {
              left: 150
            }
          },
          tooltips: {
            position: 'nearest'
          },
          legend: {
            position: 'left',
            display: false,
            onClick: null
          },
          legendCallback: function (ch) {
            var
              i, len,
              text = [];

            text.push('<ul>');
            for (i = 0, len = ch.config.data.datasets[0].data.length; i < len; i++) {
              text.push('<li>');
              text.push('<div style="background-color:' + ch.config.data.datasets[0].borderColor[i] + '">&nbsp;</div>' + ch.config.data.labels[i]);
              text.push('</li>');
            }
            text.push('</ul>');
            return text.join("");
          }
        }
      });
  }

  function getDataForChart(data, limit) {
    var
      labels = [],
      values = [],
      amountPerCountrySortedKeys,
      sumOfOthers = 0;

    if (typeof limit === 'undefined') {
      limit = 10;
    }

    amountPerCountrySortedKeys = getSortedKeys(data);
    for (let index of amountPerCountrySortedKeys) {
      if (limit > 1 && index !== 'RD' && index !== 'EU') { // > 1 because of "Others"
        limit--;
        labels.push(countries[index.toLowerCase()]);
        values.push(data[index]);
      }
      else {
        sumOfOthers += data[index];
      }
    }

    labels.push('Others');
    values.push(sumOfOthers);

    return {
      labels: labels,
      values: values
    };
  }

  function sumValues(data) {
    var total = 0, prop;

    for (prop in data) {
      total += data[prop];
    }

    return total;
  }

  function updateChart(data) {
    var
      html1, html2, html3,
      chartData = getDataForChart(data);

    chart.config.data.labels = chartData.labels.slice(0);
    chart.config.data.datasets[0].data = chartData.values.slice(0);

    chart.update();

    switch (dataType) {
      case 'cubes':
        html1 = 'We have traced';
        html2 = 'cubes ';
      break;
      case 'points':
        html1 = 'We have earned';
        html2 = 'points ';
        break;
      case 'people':
        html1 = 'There were';
        html2 = 'players ';
        break;
    }

    switch (timeRange) {
      case 'day': html3 = ' today'; break;
      case 'week': html3 = ' this week'; break;
      case 'month': html3 = ' this month'; break;
    }


    document.getElementById('ewsChartCenterLabel').innerHTML = html1 + '<br><span>' + sumValues(data) + '</span><br>' + html2 + html3;
    document.getElementById('ewsChartLegend').innerHTML = chart.generateLegend(); // custom legend
  }

  // source: https://stackoverflow.com/a/11811767
  function getSortedKeys(obj) {
    var key, keys = [];

    for(key in obj) {
      keys.push(key);
    }

    return keys.sort(function(a, b) {
      return obj[b] - obj[a];
    });
  }

  function countAveragePerUser() {
    var
      counter = 0,
      sum = 0;

    for (let row of dataCurrentlyInUse) {
      counter++;
      sum += row.points;
    }

    return counter ? Math.round(sum / counter * 100) / 100 : 0;
  }

  function countAveragePerCountry() {
    var
      data,
      index,
      counter = 0,
      sum = 0;

    data = groupByCountry(dataCurrentlyInUse);
    for (index in data) {
      counter++;
    }

    for (let row of dataCurrentlyInUse) {
      sum += row.points;
    }

    return counter ? Math.round(sum / counter * 100) / 100 : 0;
  }

  function countAverageOfPlayersPerCountry() {
    var
      data,
      index,
      counter = 0,
      sum = 0;

    data = groupByCountry(dataCurrentlyInUse);
    for (index in data) {
      sum += data[index];
      counter++;
    }

    return counter ? Math.round(sum / counter * 100) / 100 : 0;
  }

  function updateAverages() {
    var
      html,
      html1, html2;

    switch (dataType) {
      case 'points':
        html1 = 'points per user';
        html2 = 'points per country';
        break;
      case 'cubes':
        html1 = 'cubes per user';
        html2 = 'cubes per country';
        break;
      case 'people':
        html1 = 'players per country';
        html2 = '';
        break;
    }

    html = 'Average of ' + html1 + ':<br><span>' + (dataType === 'people' ? countAverageOfPlayersPerCountry() : countAveragePerUser()) + '</span>';

    if (dataType !== 'people') {
      html += '<br><br><br>Average of ' + html2 + ':<br><span>' + countAveragePerCountry() + '</span>';
    }

    $('#ewsAvg').html(html);
  }
  // end: STATS PANEL

  // ACCURACY CHART
  function hex(x) {
    x = x.toString(16);
    return (x.length == 1) ? '0' + x : x;
  }

  function getIntermediateColor(percent, start, middle, end) {
    var r, g, b, multiplier;

    if (typeof start === 'undefined') {
      start = [0, 255, 0]; // green
    }
    if (typeof middle === 'undefined') {
      middle = [255, 255, 0]; // yellow
    }
    if (typeof end === 'undefined') {
      end = [255, 0, 0]; // red
    }

    if (percent > 0.5) {
      multiplier = (percent - 0.5) * 2;
      r = Math.ceil(start[0] * multiplier + middle[0] * (1 - multiplier));
      g = Math.ceil(start[1] * multiplier + middle[1] * (1 - multiplier));
      b = Math.ceil(start[2] * multiplier + middle[2] * (1 - multiplier));
    }
    else {
      multiplier = percent * 2;
      r = Math.ceil(middle[0] * multiplier + end[0] * (1 - multiplier));
      g = Math.ceil(middle[1] * multiplier + end[1] * (1 - multiplier));
      b = Math.ceil(middle[2] * multiplier + end[2] * (1 - multiplier));
    }

    return '#' + hex(r) + hex(g) + hex(b);
  }

  function aRow(ordinal, color, height, data) {
    return '<div class="accuracy-bar" id="accuracy-bar-' + ordinal + '" style="background-color: ' + color + '; height: ' + height + '%;" data-accuracy=\''+ JSON.stringify(data) /*html*/ + '\'></div>';
  }

  function accuColor(val) {
    if (typeof val === 'string') {
      switch (val) {
        case 'TB': return TB_COLOR;
        case 'SG': return SC_COLOR;
        case 'RP': return RP_COLOR;
      }
    }
    if (typeof val === 'number') {
      return getIntermediateColor(val / 100);
    }
    return 'transparent';
  }

  function generateAccuracyChartHTMLRow(ordinal, val, data) {
    var color = accuColor(val);

    if (typeof val === 'string') {
      return aRow(ordinal, color, 100, data);
    }
    if (typeof val === 'number') {
      val /= 100;
      return aRow(ordinal, color, val * 100, data);
    }
    return aRow(ordinal, color, 0, data);
  }

  function updateAccuracyValue(val) {
    document.getElementById('accuracy-value').innerHTML = val + (typeof val === 'string' ? '' : '%');
  }

  function weightToColor(wt) {
    var
      color;

    switch (wt) {
        case 0: color = WT_0_COLOR; break;
        case 1: color = WT_1_COLOR; break;
        case 2: color = WT_2_COLOR; break;
        case 3: color = WT_3_COLOR; break;
        case 4: color = WT_4_COLOR; break;
        default: color = WT_4_COLOR;
    }

    return color;
  }

  function updateAccuracyWeight(wt) {
    var
      i, color,
      cells = document.getElementsByClassName('accuracy-weight-stripe-cell');

    wt = Math.floor(wt);
    color = weightToColor(wt--);

    for (i = 0; i <= wt && i < 4; i++) {
      cells[i].style.backgroundColor = color;
    }

    if (i < 4) {
      for (;i < 4; i++) {
        cells[i].style.backgroundColor = 'transparent';
      }
    }
  }

  function generateAccuracyWidgetHTML() {
    var
      i, len, html = '<div id="accuracy-bars-wrapper">',
      values = localStorage.getItem('ewsAccuData');

    html += generateAccuracyChartHTMLRow(11);
    if (values) {
      values = JSON.parse(values);
      accuData = values;
      for (i = 0, len = values.length; i < len; i++) {
        html += '<div class="accuracy-bar-cover"></div>';
        html += generateAccuracyChartHTMLRow(i, values[i] ? values[i].val : undefined, values[i] ? {
          val: values[i].val,
          wt: values[i].wt,
          lvl: values[i].lvl,
          score: values[i].score,
          cellId: values[i].cellId,
          cubeId: values[i].cubeId,
          timestamp: values[i].timestamp
        } : {});
      }
    }
    else {
      for (i = 0; i < 10; i++) {
        html += '<div class="accuracy-bar-cover"></div>';
        html += generateAccuracyChartHTMLRow(i, undefined, {});
      }
    }

    html += '</div>';

    html += '<div id="accuracy-bar-atlas"></div>';
    html += '<div id="accuracy-block">';
    html += '<div id="accuracy-value">no data</div>';
    html += '<div id="accuracy-weight-stripe">';
    html += '<div class="accuracy-weight-stripe-cell"></div>';
    html += '<div class="accuracy-weight-stripe-cell"></div>';
    html += '<div class="accuracy-weight-stripe-cell"></div>';
    html += '<div class="accuracy-weight-stripe-cell"></div>';
    html += '</div>';
    html += '</div>';

    $('#acc').after('<div id="accuracy-chart">' + html + '</div>');

    i--;
    if (values && typeof values[i] !== 'undefined') {
      updateAccuracyValue(values[i].val);
      updateAccuracyWeight(values[i].wt);
    }

    $('body').append('<div id="accu-floating-label"></div>');
  }

  function updateAccuracyBar(index, accu, data) {
    var el = document.getElementById('accuracy-bar-' + index);

    if (el) {
      el.style.height = (typeof accu === 'number' ? accu : '100') + '%';
      el.style.backgroundColor = accuColor(accu);
      el.dataset.accuracy = JSON.stringify(data);
    }
  }

  function updateAccuracyBars() {
    var
      i, el;

    for (i = 0; i < accuData.length; i++) {
      updateAccuracyBar(i, !accuData[i] ? undefined : accuData[i].val, accuData[i] ? {
        val: accuData[i].val,
        wt: accuData[i].wt,
        lvl: accuData[i].lvl,
        score: accuData[i].score,
        cellId: accuData[i].cellId,
        cubeId: accuData[i].cubeId,
        timestamp: accuData[i].timestamp
      } : {});
    }
  }

  function addAccuracyBar(val, wt, lvl, score, cellId, cubeId, timestamp) {
    accuData.push({val: val, wt: wt, lvl: lvl, score: score, cellId: cellId, cubeId: cubeId, timestamp: timestamp});
    accuData.shift();
    localStorage.setItem('ewsAccuData', JSON.stringify(accuData));
    updateAccuracyBars();
  }

  $(document).on('cube-submission-data', function (event, data) {
    var int = setInterval(function () {
      if (!data || data.status !== 'finished') {
        return;
      }

      var
        accuracy = Math.floor(data.accuracy * 10000) / 100,
        cubeId = tomni.task.id,
        url = '/1.0/task/' + cubeId,
        val,
        cellId = tomni.cell,
        timestamp = new Date().toLocaleString('en-US');

      if (data.special === 'scythed') {
        val = 'RP';
      }
      else if (data.trailblazer) {
        val = 'TB';
      }
      else {
        val = accuracy;
      }

      clearInterval(int);

      $.getJSON(url, function (JSONdata) {
        var weight = JSONdata.prior.weight + 1; // weight is updated on the server only after about a minute or so

        if (data.special === 'scythed') {
          weight += 2;
        }
        updateAccuracyWeight(weight);
        addAccuracyBar(val, weight, tomni.getCurrentCell().info.difficulty, data.score, cellId, cubeId, timestamp);
      });
      updateAccuracyValue(val);
      }, 100);
  });
  // end: ACCURACY CHART


  function init() {
    addMenuItem();
    $('body').append(GM_getResourceText('base_html'));

    panel = document.getElementById('ewsPanel');
    createMap();
    createChart('points');

    generateAccuracyWidgetHTML();
  }

  init();

  $("#accuracy-bars-wrapper")
    .on('mouseenter', '.accuracy-bar-cover', function(event) {
      var
        html, action, value,
        lbl = document.getElementById('accu-floating-label'),
        data = JSON.parse(this.nextSibling.dataset.accuracy);

      if (!data || typeof data.val === 'undefined') {
        return;
      }

     lbl.style.display = 'block';
      lbl.style.left = getComputedStyle(this).left;

      if (typeof data.val === 'string') {
        if (data.val === 'TB') {
          action = 'trailblazed';
          value = '--';
        }
        else if (data.val === 'RP') {
          action = 'reaped';
          value = '--';
        }
      }
      else if (typeof data.val === 'number') {
        action = 'played';
        value = data.val + '%';
      }

      html = '<table>';
      html += '<tr><td>Action</td><td>' + action + '</td></tr>';
      html += '<tr><td>Accuracy</td><td>' + value + '</td></tr>';
      html += '<tr><td>Weight</td><td>' + data.wt + '</td></tr>';
      html += '<tr><td>Score</td><td>' + data.score + '</td></tr>';
      html += '<tr><td>Cell ID</td><td>' + data.cellId + '</td></tr>';
      html += '<tr><td>Cube ID</td><td>' + data.cubeId + '</td></tr>';
      html += '<tr><td>Timestamp</td><td>' + data.timestamp + '</td></tr>';
      html += '</table>';
      lbl.innerHTML = html;
  })
  .on('mouseleave', '.accuracy-bar-cover', function(event) {
    document.getElementById('accu-floating-label').style.display = 'none';
  })
  .on('click', '.accuracy-bar-cover', function (event) {
    var data = JSON.parse(this.nextSibling.dataset.accuracy);

    if (!data || typeof data.cubeId === 'undefined') {
      return false;
    }

    tomni.jumpToTaskID(data.cubeId);
  })
  .on('contextmenu', '.accuracy-bar-cover', function (event) {
    var data = JSON.parse(this.nextSibling.dataset.accuracy);

    if (!data || typeof data.cubeId === 'undefined') {
      return false;
    }

    window.open(window.location.origin + "?tcJumpTaskId=" + data.cubeId);
  });

  $('#ewsLink').click(function () {
    $(panel).dialog('open');
  });

  // source: https://stackoverflow.com/a/14488776
  $.widget('ui.dialog', $.extend({}, $.ui.dialog.prototype, {
    _title: function(title) {
      if (!this.options.title ) {
        title.html('&#160;');
      }
      else {
        title.html(this.options.title);
      }
    }
}));

// source: https://stackoverflow.com/a/68503
$(document)
  .ajaxStart(function () {
    $('#ewsLoader').addClass('onscreen');
    setTimeout(function () {
      $('#ewsLoader').removeClass('onscreen'); // to remove animation, if it didn't stop automatically
    }, 10000);
  })
  .ajaxStop(function () {
  setTimeout(function () {
    $('#ewsLoader').removeClass('onscreen');}, 500); // to make animation more visible
  });

  $(panel).dialog({
    autoOpen: false,
    hide: true,
    modal: true,
    show: true,
    dialogClass: 'ews-dialog',
    title: 'EyeWire Statistics <div class="blinky" id=ewsLoader>',//'EyeWire Statistics <img src="https://chrisraven.github.io/EWStats/preloader.gif">',
    width: 900,
    open: function (event, ui) {
      $('.ui-widget-overlay').click(function() { // close by clicking outside the window
        $(panel).dialog('close');
      });
      map.updateSize();

      if (!DEBUG) {
        getData();
      }
      else {
        getMockupData();
      }
    }
  });

  function getData() {
    var
     url = 'https://eyewire.org/1.0/stats/top/players/by/';
    if (dataType === 'points' || dataType === 'people') {
      url += 'points';
    }
    else {
      url += 'cubes';
    }

    url += '/per/';

    if (timeRange === 'today') {
      url += 'day';
    }
    else {
      url += timeRange;
    }

    $.getJSON(url, function (data) {
      dataCurrentlyInUse = data;
      data = groupByCountry(data);
      updateMap(data);
      updateChart(data);
      updateTable(data);
      updateAverages();
    });
  }

  function getMockupData() {
    var data;

    if (dataType == 'cubes' || dataType == 'people') {
      switch (timeRange) {
        case 'day': data = cubesPerDay; break;
        case 'week': data = cubesPerWeek; break;
        case 'month': data = cubesPerMonth; break;
      }
    }
    else {
      switch (timeRange) {
        case 'day': data = pointsPerDay; break;
        case 'week': data = pointsPerWeek; break;
        case 'month': data = pointsPerMonth; break;
      }
    }

    dataCurrentlyInUse = data;
    data = groupByCountry(data);
    updateMap(data);
    updateChart(data);
    updateTable(data);
    updateAverages();
  }

  $('#ewsChart').hover(
    function () {
      $('#ewsChartCenterLabel').animate({'opacity' : 0.2});
    },
    function () {
      $('#ewsChartCenterLabel').animate({'opacity' : 1});
    }
  );

  $('.ewsNavButtonGroup').on('click', '.ewsNavButton', function (event) {
    var
      $this = $(this),
      data = $this.data();

    $this
      .parent()
        .find('.ewsNavButton')
          .removeClass('selected')
        .end()
      .end()
      .addClass('selected');

    if (data.dataType) {
      dataType = data.dataType;
    }
    else if (data.timeRange) {
      timeRange = data.timeRange;
    }

    if (!DEBUG) {
      getData();
    }
    else {
      getMockupData();
    }
  });

})();
