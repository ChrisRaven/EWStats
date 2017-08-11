// ==UserScript==
// @name         EyeWire Statistics
// @namespace    http://tampermonkey.net/
// @version      0.1.2
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

  var
    DEBUG = false,

    panel,
    map, chart,
    dataType = 'points',
    timeRange = 'day',
    dataCurrentlyInUse;

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
            if ((++rowCounter % 30) === 0) {
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


  function init() {
    addMenuItem();
    $('body').append(GM_getResourceText('base_html'));

    panel = document.getElementById('ewsPanel');
    createMap();
    createChart('points');
  }

  init();

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
