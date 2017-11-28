// ==UserScript==
// @name         EyeWire Statistics
// @namespace    http://tampermonkey.net/
// @version      1.5.3
// @description  Shows EW Statistics and adds some other functionality
// @author       Krzysztof Kruk
// @match        https://*.eyewire.org/
// @exclude      https://*.eyewire.org/1.0/*
// @downloadURL  https://raw.githubusercontent.com/ChrisRaven/EWStats/master/ewStats.user.js
// @updateURL    https://raw.githubusercontent.com/ChrisRaven/EWStats/master/ewStats.meta.js
// @grant        GM_getResourceText
// @require      https://chrisraven.github.io/EWStats/jquery-jvectormap-2.0.3.min.js
// @require      https://chrisraven.github.io/EWStats/jquery-jvectormap-world-mill.js
// @require      https://chrisraven.github.io/EWStats/spectrum.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/Chart.js/2.6.0/Chart.min.js
// @resource     base_html https://chrisraven.github.io/EWStats/base.html
// @resource     countries https://chrisraven.github.io/EWStats/countries.json
// ==/UserScript==


(function() {
  'use strict';

  var Utils = {
    gid: function (id) {
      return document.getElementById(id);
    },


    addCSSFile: function (path) {
      $("head").append('<link href="' + path + '" rel="stylesheet" type="text/css">');
    },


    reduceArray: function (arr) {
      var
        total = 0, prop;

      for (prop in arr) {
        if (arr.hasOwnProperty(prop)) {
          total += arr[prop];
        }
      }

      return total;
    },

    hex: function (x) {
      x = x.toString(16);
      return (x.length == 1) ? '0' + x : x;
    },

    // Source: https://stackoverflow.com/a/6805461
    injectJS: function (text, sURL) {
      var
        tgt,
        scriptNode = document.createElement('script');

      scriptNode.type = "text/javascript";
      if (text) {
        scriptNode.textContent = text;
      }
      if (sURL) {
        scriptNode.src = s_URL;
      }

      tgt = document.getElementsByTagName('head')[0] || document.body || document.documentElement;
      tgt.appendChild(scriptNode);
    },

    // localStorage
    ls: {
      get: function (key) {
        return localStorage.getItem(account.account.uid + '-ews-' + key);
      },

      set: function (key, val) {
        localStorage.setItem(account.account.uid + '-ews-' + key, val);
      },

      remove: function (key) {
        localStorage.removeItem(account.account.uid + '-ews-' + key);
      }
    }
  };


  var intv = setInterval(function () {
    if (!account.account.uid) {
      return;
    }
    clearInterval(intv);
    main();
  });

  function main() {

    // migration to localStorage variables associated with an account and variables' names cleaning
    var lsData = localStorage;
    if (lsData['ew-hide-buttons']) {
      Utils.ls.set('hide-buttons', lsData['ew-hide-buttons']);
      localStorage.removeItem('ew-hide-buttons');
    }

    if (lsData['ews-settings']) {
      Utils.ls.set('settings', lsData['ews-settings']);
      localStorage.removeItem('ews-settings');
    }

    if (lsData['ewsAccuData']) {
      Utils.ls.set('accu-data', lsData['ewsAccuData']);
      localStorage.removeItem('ewsAccuData');
    }

    if (lsData['ewsLastHighlighted']) {
      Utils.ls.set('last-highlighted', lsData['ewsLastHighlighted']);
      localStorage.removeItem('ewsLastHighlighted');
    }

    if (lsData['ewsSCHistory']) {
      Utils.ls.set('sc-history', lsData['ewsSCHistory']);
      localStorage.removeItem('ewsSCHistory');
    }

    if (lsData['overview-draggable']) {
      Utils.ls.set('overview-draggable', lsData['overview-draggable']);
      localStorage.removeItem('overview-draggable');
    }
    // end: migration



  // indexedDB
  const DB_NAME = 'ews';
  const DB_VERSION = 1;
  const DB_STORE_NAME = account.account.uid + '-ews-custom-highlight';

  function Database() {
    var getStore = function (mode, method, args, callback_success) {
      var
        db;

      db = indexedDB.open(DB_NAME, DB_VERSION);
      db.onsuccess = function () {
        var
          store, req;

        db = db.result;
        store = db.transaction(DB_STORE_NAME, mode).objectStore(DB_STORE_NAME);
        req = store[method](args);
        req.onerror = function (evt){};
        if (callback_success && typeof callback_success === 'function') {
          req.onsuccess = function (evt) {
            callback_success(evt.target.result);
          };
        }
      };

      db.onupgradeneeded = function (evt) {
        evt.target.result.createObjectStore(DB_STORE_NAME, {keyPath: 'cellId'});
      };
    };


    this.clearStore = function (callback) {
      getStore('readwrite', 'clear', null, callback);
    };

    this.add = function (data, callback) {
      getStore('readwrite', 'add', data, callback);
    };

    this.put = function (data, callback) {
      getStore('readwrite', 'put', data, callback);
    };

    this.get = function (key, callback) {
      getStore('readonly', 'get', key, callback);
    };

    this.delete = function (key, callback) {
      getStore('readwrite', 'delete', key, callback);
    };

    this.openCursor = function (callback) {
      getStore('readwrite', 'openCursor', null, callback);
    };
  }
  // end: indexedDB


// STATS PANEL
function StatsPanel() {
  var
    _this = this,
    panel = Utils.gid('ewsPanel'),
    chart,
    dataCurrentlyInUse,
    countries = JSON.parse(GM_getResourceText('countries'));


  this.map = null;
  this.dataType = 'points';
  this.timeRange = 'day';

  (function addMenuItem() {
    var
      li, a, list;

    li = document.createElement('li');
    li.style.cursor = 'pointer';
    a = document.createElement('a');
    a.id = 'ewsLink';
    a.innerHTML = 'Stats';
    li.appendChild(a);
    list = Utils.gid('nav').getElementsByTagName('ul')[0];
    list.insertBefore(li, list.lastChild.previousSibling); // for some reason the last child (the "Challenge" button) isn't the last child)
  })();

  // Stats dialog sceleton
  $('body').append(
   `<div id=ewsPanel>
      <div class="ewsNavButtonGroup" id=ewsTimeRangeSelection>
        <div class="ewsNavButton selected" data-time-range="day">today</div>
        <div class="ewsNavButton" data-time-range="week">week</div>
        <div class="ewsNavButton" data-time-range="month">month</div>
      </div>
      <div id=ewsWorldMap style="width: 873px; height: 400px;"></div>
      <table id=ewsChartWrapper>
        <tr>
          <td id=ewsLeftCell>
          </td>
          <td id=ewsAvg>
          </td>
          <td id=ewsRightCell>
            <div id=ewsChartFixedWrapper>
              <canvas id=ewsChart></canvas>
              <div id=ewsChartCenterLabel></div>
              <div id=ewsChartLegend></div>
            </div>
          </td>
        </tr>
      </table>
      <div class="ewsNavButtonGroup" id=ewsDataTypeSelection>
        <div class="ewsNavButton selected" data-data-type="points">points</div>
        <div class="ewsNavButton" data-data-type="cubes">cubes</div>
        <div class="ewsNavButton" data-data-type="people">people</div>
      </div>
    </div>`
  );


  this.generateTableRow = function (position, flag, name, value, highlight) {
    return '<tr class="ewsRankingRow' + (highlight ? 'Highlight' : 'Normal') + '">' + // highlighting currently not used
        '<td>' + position + '</td>' +
        '<td>' + (flag == 'rd' ? '&nbsp;' : '<img src="https://eyewire.org/static/images/flags/' + flag + '.png">') + '</td>' +
        '<td><div class="ewsCountryNameWrapper">' + name + '</div></td>' +
        '<td>' + value + '</td>' +
      '</tr>';
  };


  this.generateTableHTML = function (data) {
    var
      position = 0,
      html = '';

    for (let el of data) {
      html += this.generateTableRow(++position, el.flag, el.name, el.value, el.highlight);
    }

    return '<table>' + html + '</table>';
  };


  this.createTable = function (data, limit) {
    var
      tableData = [],
      amountPerCountrySortedKeys = this.getSortedKeys(data);

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

    return this.generateTableHTML(tableData);
  };


  this.updateTable = function (data) {
    Utils.gid('ewsLeftCell').innerHTML = this.createTable(data);
  };


  this.groupByCountry = function (data) {
    var
      country, grouped = [];

    if (this.dataType !== 'people') {
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
  };

  this.createMap = function () {
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
          lCode = code.toLowerCase(),
          val = _this.map.series.regions[0].values[code];


        switch (_this.dataType) {
          case 'cubes': lbl = 'cube'; break;
          case 'points': lbl = 'point'; break;
          case 'people': lbl = 'person'; break;
        }

        if (val != 1) {
          if (_this.dataType === 'people') {
            lbl = 'people';
          }
          else {
            lbl += 's';
          }
        }

        for (let row of dataCurrentlyInUse) {
          if (row.country === lCode) {
            htmlRows += '<tr><td>' + row.username + '</td><td>' + (_this.dataType !== 'people' ? row.points : '&nbsp;') + '</td></tr>';
            if (++rowCounter % 30 === 0) {
              htmlRows += '</table><table>';
            }
          }
        }

        if (htmlRows === '') {
          htmlRows = '<tr><td class="ews-world-map-tooltip-empty-row">';
          switch (_this.dataType) {
            case 'points': htmlRows += 'No points earned by players from '; break;
            case 'cubes':  htmlRows += 'No cubes traced by players from '; break;
            case 'people': htmlRows += 'No players from '; break;
          }
          htmlRows += _this.map.regions[code].config.name + '</td></tr>';
        }

        el.html('<div>' +
          (code == 'rd' ? '' : '<img src="https://eyewire.org/static/images/flags/' + lCode + '.png">') +
          el.html() + ' - ' + (val === undefined ? 0 : val) + ' ' + lbl +'<hr>' +
            '<table>' + htmlRows + '</table>' +
          '</div>'
        );
      }
    });

    this.map = $('#ewsWorldMap').vectorMap('get', 'mapObject');
  };


  this.getMap = function () {
    return this.map;
  };

  this.updateMap = function (values) {
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
    this.map.params.series.regions[0].min = min;
    this.map.params.series.regions[0].max = max;
    this.map.series.regions[0].clear(); // if not cleared, the values, which aren't in the current set, remain from the previous set
    this.map.series.regions[0].setValues(values);
  };

  this.createChart = function (label) {
      var
        ctx = Utils.gid("ewsChart").getContext('2d');

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
  };


  this.getDataForChart = function (data, limit) {
    var
      labels = [],
      values = [],
      amountPerCountrySortedKeys,
      sumOfOthers = 0;

    if (typeof limit === 'undefined') {
      limit = 10;
    }

    amountPerCountrySortedKeys = this.getSortedKeys(data);
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
  };


  this.updateChart = function (data) {
    var
      html1, html2, html3,
      chartData = this.getDataForChart(data);

    chart.config.data.labels = chartData.labels.slice(0);
    chart.config.data.datasets[0].data = chartData.values.slice(0);

    chart.update();

    switch (this.dataType) {
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

    switch (this.timeRange) {
      case 'day': html3 = ' today'; break;
      case 'week': html3 = ' this week'; break;
      case 'month': html3 = ' this month'; break;
    }


    Utils.gid('ewsChartCenterLabel').innerHTML = html1 + '<br><span>' + Utils.reduceArray(data) + '</span><br>' + html2 + html3;
    Utils.gid('ewsChartLegend').innerHTML = chart.generateLegend(); // custom legend
  };


  // source: https://stackoverflow.com/a/11811767
  this.getSortedKeys = function (obj) {
    var
      key, keys = [];

    for(key in obj) {
      keys.push(key);
    }

    return keys.sort(function(a, b) {
      return obj[b] - obj[a];
    });
  };


  this.countAveragePerUser = function () {
    var
      counter = 0,
      sum = 0;

    for (let row of dataCurrentlyInUse) {
      counter++;
      sum += row.points;
    }

    return counter ? Math.round(sum / counter * 100) / 100 : 0;
  };


  this.countAveragePerCountry = function () {
    var
      data,
      index,
      counter = 0,
      sum = 0;

    data = this.groupByCountry(dataCurrentlyInUse);
    for (index in data) {
      counter++;
    }

    for (let row of dataCurrentlyInUse) {
      sum += row.points;
    }

    return counter ? Math.round(sum / counter * 100) / 100 : 0;
  };


  this.countAverageOfPlayersPerCountry = function () {
    var
      data,
      index,
      counter = 0,
      sum = 0;

    data = this.groupByCountry(dataCurrentlyInUse);
    for (index in data) {
      sum += data[index];
      counter++;
    }

    return counter ? Math.round(sum / counter * 100) / 100 : 0;
  };


  this.updateAverages = function () {
    var
      html,
      html1, html2;

    switch (this.dataType) {
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

    html = 'Average of ' + html1 + ':<br><span>' + (this.dataType === 'people' ? this.countAverageOfPlayersPerCountry() : this.countAveragePerUser()) + '</span>';

    if (this.dataType !== 'people') {
      html += '<br><br><br>Average of ' + html2 + ':<br><span>' + this.countAveragePerCountry() + '</span>';
    }

    $('#ewsAvg').html(html);
  };


  this.getData = function () {
    var
      url = 'https://eyewire.org/1.0/stats/top/players/by/';

    if (this.dataType === 'points' || this.dataType === 'people') {
      url += 'points';
    }
    else {
      url += 'cubes';
    }

    url += '/per/';

    if (this.timeRange === 'today') {
      url += 'day';
    }
    else {
      url += this.timeRange;
    }

    $.getJSON(url, function (data) {
      dataCurrentlyInUse = data;
      data = _this.groupByCountry(data);
      _this.updateMap(data);
      _this.updateChart(data);
      _this.updateTable(data);
      _this.updateAverages();
    });
  };

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
        $('#ewsLoader').removeClass('onscreen');
      }, 500); // to make animation more visible
    });

  $('#ewsPanel').dialog({
    autoOpen: false,
    hide: true,
    modal: true,
    show: true,
    dialogClass: 'ews-dialog',
    title: 'EyeWire Statistics <div class="blinky" id=ewsLoader>',
    width: 900,
    open: function (event, ui) {
      $('.ui-widget-overlay').click(function() { // close by clicking outside the window
        $('#ewsPanel').dialog('close');
      });
      _this.map.updateSize();
      _this.getData();
    }
  });

  $('#ewsLink').click(function () {
    if (!_this.map) {
      _this.createMap();
    }
    $('#ewsPanel').dialog('open');
  });

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
      _this.dataType = data.dataType;
    }
    else if (data.timeRange) {
      _this.timeRange = data.timeRange;
    }
    _this.getData();
  });

  this.createChart('points');
}
// end: STATS PANEL

// ACCURACY CHART
function AccuChart() {

  const
    TB_COLOR = 'lightgray',
    RP_COLOR = '#0066FF',
    SC_COLOR = 'pink',
    WT_0_COLOR = '#FF554D',
    WT_1_COLOR = '#46DBE8',
    WT_2_COLOR = '#9659FF',
    WT_3_COLOR = '#93FF59',
    WT_4_COLOR = 'green';

  var
    accuData = new Array(60),
    refreshData = false,
    _this = this;


  this.cubeData = null;

  this.getIntermediateColor = function (percent, start, middle, end) {
    var
      r, g, b, multiplier;

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

    return '#' + Utils.hex(r) + Utils.hex(g) + Utils.hex(b);
  };


  this.aRow = function (ordinal, color, height, data) {
    return '<div ' +
      'class="accuracy-bar-2" id="accuracy-bar-2-' + ordinal + '" ' +
      // margin added to fix problem, when bars were "glued" to the top, when there weren't any 100% (44px) height bars
      'style="background-color: ' + color + '; height: ' + height * 0.44 + 'px; margin-top: ' + (44 - height * 0.44) + 'px;" ' +
      'data-accuracy=\''+ JSON.stringify(data) +
    '\'></div>';
  };


  this.accuColor = function (val, action) {
    if (action) {
      if (action !== 'PL') {
        switch (action) {
          case 'TB': return TB_COLOR;
          case 'SG': return SC_COLOR;
          case 'RP': return RP_COLOR;
        }
      }
      else if (action === 'PL') {
        return this.getIntermediateColor(val / 100);
      }
    }

    // for older versions of the script
    if (typeof val === 'string') {
      switch (val) {
        case 'TB': return TB_COLOR;
        case 'SG': return SC_COLOR;
        case 'RP': return RP_COLOR;
      }
    }

    if (typeof val === 'number') {
      return this.getIntermediateColor(val / 100);
    }

    return 'transparent';
  };


  this.generateAccuracyChartHTMLRow = function (ordinal, val, data) {
    var
      color = this.accuColor(val, data.action);

    if (typeof val === 'string') {
      return this.aRow(ordinal, color, 100, data);
    }
    if (typeof val === 'number') {
      val /= 100;
      return this.aRow(ordinal, color, val * 100, data);
    }
    return this.aRow(ordinal, color, 0, data);
  };


  this.updateAccuracyValue = function (val) {
    var
      el = Utils.gid('accuracy-value');

    el.style.color = typeof val === 'number' && val === 100 ? '#00FF00' : '#E4E1E1';
    el.innerHTML = val + (typeof val === 'string' ? '' : '%');
  };


  this.weightToColor = function (wt) {
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
  };


  this.updateAccuracyWeight = function (wt) {
    var
      i, color,
      cells = document.getElementsByClassName('accuracy-weight-stripe-cell');

    wt = Math.floor(wt);
    color = this.weightToColor(wt--); // wt1 = cells[0] filled in, hence wt--

    for (i = 0; i <= wt && i < 4; i++) {
      cells[i].style.backgroundColor = color;
    }

    if (i < 4) {
      for (;i < 4; i++) {
        cells[i].style.backgroundColor = 'transparent';
      }
    }
  };


  function check(arg) {
    var
      data = Utils.gid('accuracy-bar-2-' + arg).dataset.accuracy;

    return !!(data && data !== '{}');
  }


  this.addLinesIfNeeded = function () {
    var
      l1 = Utils.gid('separator-line-1'),
      l2 = Utils.gid('separator-line-2'),
      l3 = Utils.gid('separator-line-3'),
      l4 = Utils.gid('separator-line-4'),
      l5 = Utils.gid('separator-line-5');

    if (l5) l5.style.display = check(49) && check(50) ? 'block' : 'none';
    if (l4) l4.style.display = check(39) && check(40) ? 'block' : 'none';
    if (l3) l3.style.display = check(29) && check(30) ? 'block' : 'none';
    if (l2) l2.style.display = check(19) && check(20) ? 'block' : 'none';
    if (l1) l1.style.display = check( 9) && check(10) ? 'block' : 'none';
  };


  // update from the older version of the script, where there were only 10 bars
  this.updateDataFormat = function (arr) {
    var
      i, j,
      newArr = [],
      len = arr.length;

    if (len === 60) {
      return arr;
    }

    for (i = 0; i <60 - len; i++) {
      newArr.push(null);
    }
    for (j = 0; i < 60; i++, j++) {
      newArr.push(arr[j]);
    }

    return newArr;
  };


  this.highlightBar = function (id) {
    $('.accuracy-bar-cover-2-highlighted').removeClass('accuracy-bar-cover-2-highlighted');
    $('#accuracy-bar-2-' + id).prev().addClass('accuracy-bar-cover-2-highlighted');

    Utils.ls.set('last-highlighted', id);
  };


  this.updateAccuracyBar = function (index, accu, data, changeColor) {
    var
      el = Utils.gid('accuracy-bar-2-' + index);

    if (typeof changeColor === 'undefined') {
      changeColor = true;
    }

    if (el) {
      el.style.height = (typeof accu === 'number' ? accu * 0.44 : '44') + 'px';
      if (changeColor) {
        el.style.backgroundColor = this.accuColor(accu);
      }
      el.style.marginTop = (typeof accu === 'number' ? 44 - accu * 0.44 : '0') + 'px';
      el.dataset.accuracy = JSON.stringify(data);
    }

    if (el.dataset.accuracy && el.dataset.accuracy !== '{}') {
      el.previousSibling.style.visibility = 'visible';
    }
    else {
      el.previousSibling.style.visibility = 'hidden';
    }
  };


  this.refreshAccuDataFromServer = function () {
    var
      waiting = 2;

    document.getElementsByClassName('accu-refresh-progress-bar')[0].value = 100;

    if (!refreshData  || !settings.get('ews-accu-bars')) {
      this.animateRefreshProgressBar(); // to still check every minute, if there's something to refresh, but not to connect to the server, if there isn't anything
      return;
    }

    $('.accu-refresh-progress-bar').addClass('accu-refresh-progress-bar-refreshing');

    $.getJSON('https://eyewire.org//1.0/player/accuracyBreakdown/1', function (data) { // both getJSON()'s not in a function, to keep "waiting" in context
      var
        i, len, el, accu, elData,
        indexedData = {};

      if (!data) {
        return;
      }
      if (!--waiting) {
        $('.accu-refresh-progress-bar').removeClass('accu-refresh-progress-bar-refreshing');
        _this.animateRefreshProgressBar();
      }

      for (i = 0, len = data.length; i < len; i++) {
        indexedData[data[i].task_id] = data[i];
      }

      for (i = 0, len = accuData.length; i < len; i++) {
        if (accuData[i] && accuData[i].cubeId) {
          el = indexedData[accuData[i].cubeId];
          if (el) {
            accu = 200 * el.tp / (2 * el.tp + el.fp + el.fn);
            accu = Math.floor(accu * 100) / 100;
            elData = accuData[i];
            elData.val = accu;
            accuData[i] = elData;
            // if a cube was normal played before, update its color, otherwise, don't change it
            _this.updateAccuracyBar(i, accu, elData, el.action === 'PL');
            if (i === 59) { // if the newest cube is updated from the server, then update also the value to the right of the bars
              _this.updateAccuracyValue(accu);
            }
          }
        }
      }

      Utils.ls.set('accu-data', JSON.stringify(accuData));
    });

    $.getJSON('https://eyewire.org//1.0/player/accuracyBreakdown/2', function (data) {
      var
        i, len, el, accu, elData,
        indexedData = {};

      if (!data) {
        return;
      }
      if (!--waiting) {
        $('.accu-refresh-progress-bar').removeClass('accu-refresh-progress-bar-refreshing');
        _this.animateRefreshProgressBar();
      }

      for (i = 0, len = data.length; i < len; i++) {
        indexedData[data[i].task_id] = data[i];
      }

      for (i = 0, len = accuData.length; i < len; i++) {
        if (accuData[i] && accuData[i].cubeId) {
          el = indexedData[accuData[i].cubeId];
          if (el) {
            accu = 200 * el.tp / (2 * el.tp + el.fp + el.fn);
            accu = Math.floor(accu * 100) / 100;
            elData = accuData[i];
            elData.val = accu;
            accuData[i] = elData;
            _this.updateAccuracyBar(i, accu, elData, el.action === 'PL');
            if (i === 59) {
              _this.updateAccuracyValue(accu);
            }
          }
        }
      }

      Utils.ls.set('accu-data', JSON.stringify(accuData));
    });

  };


  this.animateRefreshProgressBar = function () {
    $('.accu-refresh-progress-bar').animate({value: '0'}, {
      duration: 60000,
      easing: 'linear',
      complete: this.refreshAccuDataFromServer.bind(this) // source: https://stackoverflow.com/a/15441434
    });
  };


  this.generateAccuracyWidgetHTML = function () {
    var
      i, len, html = '',
      contFlag = false,
      row,
      values = Utils.ls.get('accu-data'),
      lastHighlightedBar = Utils.ls.get('last-highlighted'),
      settings,
      visibilityState = 'block';
      
      settings = Utils.ls.get('settings');

      if (settings) {
        settings = JSON.parse(settings);
        if (settings['ews-accu-bars']) {
          visibilityState = 'block';
          Utils.gid('activityTrackerContainer').style.display = 'none';
        }
        else {
          visibilityState = 'none';
          Utils.gid('activityTrackerContainer').style.display = 'block';
        }
      }

    $('body').append(
      '<div id="accuracy-container" style="display:' + visibilityState + ';">' +
        '<span id="more-less-button" data-state="closed">more &darr;</span>' +
        '<div id="accuracy-bars-wrapper-2"></div>' +
        '<div id="weight-wrapper">' +
          '<div id="accuracy-value">no data</div>' +
          '<div id="accuracy-weight-stripe">' +
          '<div class="accuracy-weight-stripe-cell"></div>'.repeat(4) +
        '</div>' +
      '</div>'
    );

    if (values) {
      refreshData = true;

      values = this.updateDataFormat(JSON.parse(values)); // to migrate from the old 10-cubes format
      accuData = values;
      for (len = values.length, i = len - 10; i > -1; (i + 1) % 10 && !contFlag ? i++ : (i -=19, contFlag = true)) { // i = 50..59, 40..49, (...), 0..9
        contFlag = false;
        html += '<div class="accuracy-bar-cover-2 ' + (i >= 50 ? 'permanent-bar' : 'hideable-bar') + '" style="visibility: ' + (values[i] ? 'visible' : 'hidden') + ';"></div>';
        html += this.generateAccuracyChartHTMLRow(i, values[i] ? values[i].val : undefined, values[i] ? {
          action: values[i].action,
          val: values[i].val,
          wt: values[i].wt,
          lvl: values[i].lvl,
          score: values[i].score,
          cellId: values[i].cellId,
          cubeId: values[i].cubeId,
          timestamp: values[i].timestamp
        } : {});

        row = Math.floor(i / 10);
        if ((i + 1) % 10 === 0 && i > 10) {
          html += '<div class="separator-line" id="separator-line-' + row + '" style="display: none;"></div>';
        }
      }
    }
    else {
      for (len = 60, i = len - 10; i > -1; (i + 1) % 10 && !contFlag ? i++ : (i -=19, contFlag = true)) { // i = 50..59, 40..49, (...), 0..9
        contFlag = false;
        html += '<div class="accuracy-bar-cover-2 ' + (i >= 50 ? 'permanent-bar' : 'hideable-bar') + '" style="visibility: hidden;"></div>';
        html += this.generateAccuracyChartHTMLRow(i, undefined, {});

        row = Math.floor(i / 10);
        if ((i + 1) % 10 === 0 && i > 10) {
          html += '<div class="separator-line" id="separator-line-' + row + '" style="display: none;"></div>';
        }
      }
    }

    html += '<progress class="accu-refresh-progress-bar" value="100" max="100"></progress>';
    Utils.gid('accuracy-bars-wrapper-2').innerHTML = html;
    this.addLinesIfNeeded();

    if (values && typeof values[59] !== 'undefined') {
      this.updateAccuracyValue(values[59].val);
      this.updateAccuracyWeight(values[59].wt);

      if (lastHighlightedBar) {
        this.highlightBar(lastHighlightedBar);
      }
    }

    $('#content').append('<div id="accu-floating-label"></div>');

    this.animateRefreshProgressBar();
  };


  this.updateAccuracyBars = function () {
    var
      i;

    for (i = 0; i < accuData.length; i++) {
      this.updateAccuracyBar(i, !accuData[i] ? undefined : accuData[i].val, accuData[i] ? {
        action: accuData[i].action,
        val: accuData[i].val,
        wt: accuData[i].wt,
        lvl: accuData[i].lvl,
        score: accuData[i].score,
        cellId: accuData[i].cellId,
        cubeId: accuData[i].cubeId,
        timestamp: accuData[i].timestamp
      } : {});
    }

    this.addLinesIfNeeded();
  };


  this.addAccuracyBar = function (action, val, wt, lvl, score, cellId, cubeId, timestamp) {
    refreshData = true;

    accuData.push({action: action, val: val, wt: wt, lvl: lvl, score: score, cellId: cellId, cubeId: cubeId, timestamp: timestamp});
    accuData.shift();
    Utils.ls.set('accu-data', JSON.stringify(accuData));
    this.updateAccuracyBars();
    this.highlightBar(59);
  };


  this.updatePlayedAccuracyBar = function (action, barId, val, wt, score, timestamp) { // when player reaps a cube, which was already on the list
    var
      prevData,
      data,
      el = Utils.gid('accuracy-bar-2-' + barId);

    if (el) {
      el.style.height = (typeof val === 'number' ? val * 0.44 : '44') + 'px';
      el.style.marginTop = (typeof val === 'number' ? 44 - val * 0.44 : '0') + 'px';
      el.style.backgroundColor = this.accuColor(val, action);
      data = JSON.parse(el.dataset.accuracy);
      data.action = 'RP';
      data.val = val;
      data.wt = wt;
      data.score = score;
      data.timestamp = timestamp;
      el.dataset.accuracy = JSON.stringify(data);
    }

    accuData[barId] = data;
    Utils.ls.set('accu-data', JSON.stringify(accuData));
    this.highlightBar(barId);
  };


  this.getCubeData = function () {
    this.cubeData = {
      cubeId: tomni.task.id,
      cellId: tomni.cell,
      level: tomni.getCurrentCell().info.difficulty
    };
  };


  this.wasRecentlyPlayed = function (id) {
    var
      i, len = accuData.length;

    if (len) {
      for (i = 0; i < len; i++) {
        if (accuData[i] && accuData[i].cubeId === id) {
          return i;
        }
      }
    }

    return -1;
  };


  this.generateAccuracyWidgetHTML();


  $(document).on('cube-submission-data', function (event, data) {
    var
      cubeId = _this.cubeData.cubeId,
      cellId = _this.cubeData.cellId,
      intv, action;

    intv = setInterval(function () {
      if (!data || data.status !== 'finished') {
        return;
      }

      var
        accuracy = Math.floor(data.accuracy * 10000) / 100,
        url = '/1.0/task/' + cubeId,
        val,
        timestamp = new Date().toLocaleString('en-US');

      if (data.special === 'scythed') {
        val = 'RP';
        action = 'RP';
      }
      else if (data.trailblazer) {
        val = 'TB';
        action = 'TB';
      }
      else {
        val = accuracy;
        action = 'PL';
      }

      clearInterval(intv);

      $.getJSON(url, function (JSONdata) {
        var
          barId,
          weight = JSONdata.prior.weight + 1; // weight is updated on the server only after about a minute or so

        if (data.special === 'scythed') {
          weight += 2;
        }

        weight = Math.round(weight * 10) / 10;
        _this.updateAccuracyWeight(weight);
        barId = _this.wasRecentlyPlayed(cubeId);
        if (barId !== -1) {
          _this.updatePlayedAccuracyBar(action, barId, val, weight, data.score, timestamp);
        }
        else {
          _this.addAccuracyBar(action, val, weight, tomni.getCurrentCell().info.difficulty, data.score, cellId, cubeId, timestamp);
        }
      });
      _this.updateAccuracyValue(val);
      }, 100);
  });

  $(document)
    .on('mouseenter', '.accuracy-bar-cover-2', function(event) {
      var
        html, action, val,
        lbl = Utils.gid('accu-floating-label'),
        data = JSON.parse(this.nextElementSibling.dataset.accuracy);

      if (!data || typeof data.val === 'undefined') {
        return;
      }

      lbl.style.display = 'block';
      lbl.style.width = '230px';
      lbl.style.height = '175px';
      lbl.style.left = this.getBoundingClientRect().left + 'px';
      lbl.style.top = this.getBoundingClientRect().bottom + 'px';

      if (typeof data.val === 'string') {
        if (data.val === 'TB') {
          action = 'trailblazed';
          val = '--';
        }
        else if (data.val === 'RP') {
          action = 'reaped';
          val = '--';
        }
      }
      else if (typeof data.val === 'number') {
        action = 'played';
        val = data.val + '%';
      }

      html = '<table>';
      html += '<tr><td>Action</td><td>' + action + '</td></tr>';
      html += '<tr><td>Accuracy</td><td>' + val + '</td></tr>';
      html += '<tr><td>Weight*</td><td>' + data.wt.toFixed(1) + '</td></tr>';
      html += '<tr><td>Score</td><td>' + data.score + '</td></tr>';
      html += '<tr><td>Cell ID</td><td>' + data.cellId + '</td></tr>';
      html += '<tr><td>Cube ID</td><td>' + data.cubeId + '</td></tr>';
      html += '<tr><td>Timestamp</td><td>' + data.timestamp + '</td></tr>';
      html += '<tr><td colspan=2 class="ews-accu-popup-asterisk">* when submitted</td></tr>';
      html += '</table>';
      lbl.innerHTML = html;
  })
  .on('mouseleave', '.accuracy-bar-cover-2', function(event) {
    Utils.gid('accu-floating-label').style.display = 'none';
  })
  .on('click', '.accuracy-bar-cover-2', function (event) {
    var
      data = JSON.parse(this.nextElementSibling.dataset.accuracy);

    if (!data || typeof data.cubeId === 'undefined') {
      return false;
    }

    tomni.jumpToTaskID(data.cubeId);
  })
  .on('contextmenu', '.accuracy-bar-cover-2', function (event) {
    var
      data = JSON.parse(this.nextElementSibling.dataset.accuracy);

    if (!data || typeof data.cubeId === 'undefined') {
      return false;
    }

    window.open(window.location.origin + "?tcJumpTaskId=" + data.cubeId);
  });

  $(document)
    .on('mouseenter', '#accuracy-weight-stripe', function () {
      var
        html = '',
        lbl = Utils.gid('accu-floating-label');

      lbl.style.width = '190px';
      lbl.style.height = '120px';
      lbl.style.display = 'block';
      lbl.style.left = this.getBoundingClientRect().left + 'px';
      lbl.style.top = this.getBoundingClientRect().bottom + 'px';

      function div(weight) {
        return '<div class="accu-wt-lbl-cell" style="background-color: ' + _this.weightToColor(weight) + ';"></div>';
      }

      html = '<table>';
      html += '<tr><td>' + div(1)           + '</td><td>1 &ge; weight &lt; 2</td></tr>';
      html += '<tr><td>' + div(2).repeat(2) + '</td><td>2 &ge; weight &lt; 3</td></tr>';
      html += '<tr><td>' + div(3).repeat(3) + '</td><td>3 &ge; weight &lt; 4</td></tr>';
      html += '<tr><td>' + div(4).repeat(4) + '</td><td>weight &ge; 4</td></tr>';
      html += '<tr><td>' + div(0).repeat(4) + '</td><td>no cubes played yet</td></tr>';
      html += '</table>';

      lbl.innerHTML = html;
    })
    .on('mouseleave', function () {
      Utils.gid('accu-floating-label').style.display = 'none';
    });

  $(document)
    .on('click', '#more-less-button', function () {
      var
        panel = Utils.gid('accuracy-bars-wrapper-2');

      if (this.dataset.state === 'closed') {

        this.dataset.state = 'opened';
        this.innerHTML = 'less &uarr;';
        panel.style.height = '371px';
        $('.hideable-bar').css('display', 'inline-block');
      }
      else {
        this.dataset.state = 'closed';
        this.innerHTML = 'more &darr;';
        panel.style.height = '44px';
        $('.hideable-bar').css('display', 'none');
      }
    })
    .on('ews-setting-changed', function (evt, data) {console.log('changed')
      if (data.setting === 'ews-accu-bars') {
        if (data.state) {
          Utils.gid('accuracy-container').style.display = 'block';
          Utils.gid('activityTrackerContainer').style.display = 'none';
        }
        else {
          Utils.gid('accuracy-container').style.display = 'none';
          Utils.gid('activityTrackerContainer').style.display = 'block';
        }
      }
    });
}
// end: ACCURACY CHART


// SC HISTORY
function SCHistory() {
  var
    _this = this,
    stringFunc;

  $('body').append('<div id="ewsSCHistory"><div id="ewsSCHistoryWrapper"></div></div>');

  $('#ewsSCHistory').dialog({
    autoOpen: false,
    hide: true,
    modal: true,
    show: true,
    dialogClass: 'ews-dialog',
    title: 'Cubes completed in cells SCed during last 30 days',
    width: 800,
    open: function (event, ui) {
      $('.ui-widget-overlay').click(function() { // close by clicking outside the window
        $('#ewsSCHistory').dialog('close');
      });
    }
  });

  Utils.injectJS(`
    (function (open) {
      XMLHttpRequest.prototype.open = function (method, url, async, user, pass) {
        this.addEventListener("readystatechange", function (evt) {
          if (this.readyState == 4 && this.status == 200 &&
              url.indexOf('/1.0/task/') !== -1 &&
              url.indexOf('/submit') === -1 &&
              method.toLowerCase() === 'post') {
            $(document).trigger('votes-updated', {cellId: tomni.cell, cellName: tomni.getCurrentCell().info.name, datasetId: tomni.getCurrentCell().info.dataset_id});
          }
        }, false);
        open.call(this, method, url, async, user, pass);
      };
    }) (XMLHttpRequest.prototype.open)
  `);

  if (!Utils.ls.get('sc-history-updated') || !Utils.ls.get('sc-history-updated-second-attempt')) {
    Utils.ls.set('sc-history-updated', true);
    Utils.ls.get('sc-history-updated-second-attempt', true);
    let scHistory = Utils.ls.get('sc-history');
    if (scHistory) {
      scHistory = JSON.parse(scHistory);
      for (let cellId in scHistory) {
        $.getJSON('https://eyewire.org/1.0/cell/' + cellId, function (data) {
          if (data) {
            // we net to read and write to localStorage everytime, because async
            let his = JSON.parse(Utils.ls.get('sc-history'));
            his[cellId].datasetId = data.dataset_id;
            Utils.ls.set('sc-history', JSON.stringify(his));
          }
        });
      }
    }
  }

  this.updateCount = function (count, cellId, cellName, timestamp, datasetId) {
    var
      lsHistory = Utils.ls.get('sc-history');

    if (lsHistory && lsHistory !== '{}') {
      lsHistory = JSON.parse(lsHistory);
    }
    else {
      lsHistory = {};
    }

    lsHistory[cellId] = {count: count, ts: timestamp, name: cellName, datasetId: datasetId};

    Utils.ls.set('sc-history', JSON.stringify(lsHistory));
  };

  this.removeOldEntries = function () {
    var
      cellId,
      now = Date.now(),
      thirtyDays = 1000 * 60 * 60 * 24 * 30,
      lsHistory = Utils.ls.get('sc-history');

    if (lsHistory && lsHistory !== '{}') {
      lsHistory = JSON.parse(lsHistory);
      for (cellId in lsHistory) {
        if (lsHistory.hasOwnProperty(cellId)) {
          if (now - lsHistory[cellId].ts > thirtyDays) {
            delete lsHistory[cellId];
          }
        }
      }
      Utils.ls.set('sc-history', JSON.stringify(lsHistory));
    }
  };

  this.removeEntry = function (cellId) {
    var
      lsHistory = Utils.ls.get('sc-history');

    if (lsHistory && lsHistory !== '{}') {
      lsHistory = JSON.parse(lsHistory);
      delete lsHistory[cellId];
      Utils.ls.set('sc-history', JSON.stringify(lsHistory));
    }
  };

  this.updateDialogWindow = function () {
    var
      cellId,
      html = '',
      el, threshold,
      lsHistory = Utils.ls.get('sc-history');

    if (lsHistory && lsHistory !== '{}') {
      lsHistory = JSON.parse(lsHistory);
      html += `
        <div class="ewsNavButtonGroup" id="ews-sc-history-period-selection">
          <div class="ewsNavButton" data-time-range="day">last 24h</div>
          <div class="ewsNavButton" data-time-range="week">last 7 days</div>
          <div class="ewsNavButton selected" data-time-range="month">last 30 days</div>
        </div>
        <div class="ewsNavButtonGroup" id="ews-sc-history-dataset-selection">
          <div class="ewsNavButton" data-type="1">Mouse's Retina</div>
          <div class="ewsNavButton" data-type="11">Zebrafish's Hindbrain</div>
          <div class="ewsNavButton selected" data-type="both">Both</div>
        </div>
      `;

      html += `<table id="ews-sc-history-results">
        <thead><tr>
          <th># of SCs</th>
          <th>Cell Name</th>
          <th>Cell ID</th>
          <th>Timestamp</th>
          <th>sc-info</th>
          <th>Cubes you can SC</th>
          <th>&nbsp;</th>
        </tr></thead>`;
      html += '<tbody>';
      for (cellId in lsHistory) {
        if (lsHistory.hasOwnProperty(cellId)) {
          el = lsHistory[cellId];
          if (el.count > 100) {
            threshold = ' class="SCHistory-100"';
          }
          else if (el.count > 50) {
            threshold = ' class="SCHistory-50"';
          }
          else {
            threshold = '';
          }

          html += `<tr
          data-cell-id="` + cellId + `"
          data-timestamp="` + el.ts + `"
          data-dataset-id="` + el.datasetId + `"
          >
            <td` + threshold + `>` + el.count + `</td>
            <td class="sc-history-cell-name">` + el.name + `</td>
            <td class="sc-history-cell-id">` + cellId + `</td>
            <td>` + (new Date(el.ts)).toLocaleString() + `</td>
            <td><button class="sc-history-check-button minimalButton">Check</button></td>
            <td class="sc-history-results"></td>
            <td><button class="sc-history-remove-button minimalButton">Remove</button></td>
          </tr>`;
        }
      }
      html += '</tbody></table>';
    }
    else {
      html = 'no cubes SCed for last 7 days or since installing the script';
    }

    Utils.gid('ewsSCHistoryWrapper').innerHTML = html;
  };


  this.filter = function (period, type) {
    var
      range,
      day = 1000 * 60 * 60 * 24,
      now = Date.now(),
      rows = document.querySelectorAll('#ews-sc-history-results tbody tr');

      switch (period) {
        case 'day': range = now - day; break;
        case 'week': range = now - 7 * day; break;
        case 'month': range = now - 30 * day; break;
      }


      for (let row of rows) {
        if (row.dataset.timestamp >= range && (type === 'both' || row.dataset.datasetId == type)) {
          row.style.display = 'table-row';
        }
        else {
          row.style.display = 'none';
        }
      }
  };

  $(document)
    .on('contextmenu', '#profileButton', function (e) {
      e.preventDefault();
      e.stopPropagation();
      _this.updateDialogWindow();
      $('#ewsSCHistory').dialog('open');
      Utils.gid('ewsSCHistory').style.maxHeight = window.innerHeight - 100 + 'px';
    })
    .on('votes-updated', function (event, data) {
      var
        _data = data,
        host = window.location.hostname,
        targetUrl = 'https://';

      if (host.indexOf('beta') !== -1) {
        targetUrl += 'beta.';
      }
      else if (host.indexOf('chris') !== -1) {
        targetUrl += 'chris.';
      }
      targetUrl += 'eyewire.org/1.0/cell/' + data.cellId + '/tasks/complete/player';

      $.getJSON(targetUrl, function (JSONData) {
        var
          uid = account.account.uid,
          btn = $('.showmeme button');

        if (!JSONData) {
          return;
        }

        _this.updateCount(JSONData.scythe[uid].length, _data.cellId, _data.cellName, Date.now(), _data.datasetId);

        if (!btn.hasClass('on1') && settings.get('ews-auto-refresh-showmeme')) {
          if (btn.hasClass('on2')) {
            btn.click().click().click();
          }
          else {
            btn.click();

            setTimeout(function () {
              btn.click();
              setTimeout(function () {
                btn.click();
              }, 500);
            }, 500);
          }

        }
      });
    });

  $('#ewsSCHistoryWrapper')
    .on('click', '.sc-history-cell-name', function () {
      tomni.setCell({id: this.nextElementSibling .innerHTML});
    })
    .on('click', '.sc-history-check-button', function () {
      var
        _this = this,
        semaphore = 3,
        tasks, scytheData, completeData, myTasks,
        cellId = this.parentNode.parentNode.dataset.cellId;

        function cleanTasks(potentialTasks, taskArray) {
          var
            i, len,
            index;

          for(i = 0, len = taskArray.length; i < len; i++) {
            index = potentialTasks.indexOf(taskArray[i]);

            if(index >= 0) {
              potentialTasks.splice(index, 1);
            }
          }

          return potentialTasks;
        }

      function runWhenDone() {
        var
          i, len, cur, index,
          potentialTasks,
          frozen, complete;

        if (--semaphore) {
          return;
        }

        potentialTasks = tasks.tasks.map(function(elem)  {return elem.id; });

        frozen = scytheData.frozen || [];
        complete = scytheData.complete || [];

        for(i = 0, len = complete.length; i < len; i++) {
            cur = complete[i];
            if(cur.votes < 2) {
              continue;
            }

            index = potentialTasks.indexOf(complete[i].id);

            if(index >= 0) {
                potentialTasks.splice(index, 1);
            }
        }

        cleanTasks(potentialTasks, frozen);

        completeData = JSON.parse(completeData);
        myTasks = completeData.scythe[account.account.uid.toString()] || [];

        cleanTasks(potentialTasks, myTasks);

        $.get("/1.0/cell/" + cellId + "/heatmap/low-weight?weight=3").done(function(data) {
            if(data["0"]) {
              cleanTasks(potentialTasks, data["0"].map(function(elem) { return elem.task_id; }));
            }
            if(data["1"]) {
              cleanTasks(potentialTasks, data["1"].map(function(elem) { return elem.task_id; }));
            }
            if(data["2"]) {
              cleanTasks(potentialTasks, data["2"].map(function(elem) { return elem.task_id; }));
            }

            _this.parentNode.nextElementSibling.innerHTML = potentialTasks.length;

        });
      }

      // source: crazyman's script
      $.get("/1.0/cell/" + cellId + "/tasks").done(function(_tasks) {
        tasks = _tasks;
        runWhenDone();
      });

      $.get("/1.0/cell/" + cellId + "/heatmap/scythe").done(function(_scytheData) {
        scytheData = _scytheData;
        runWhenDone();
      });

      $.get("/1.0/cell/" + cellId + "/tasks/complete/player").done(function(_completeData) {
        completeData = _completeData;
        runWhenDone();
      });
    })
    .on('click', '.sc-history-remove-button', function () {
      var id;

      id = this.parentNode.parentNode.getElementsByClassName('sc-history-cell-id')[0].innerHTML;
      _this.removeEntry(id);
      this.parentNode.parentNode.remove();
    })
    .on('click', '#ews-sc-history-period-selection .ewsNavButton, #ews-sc-history-dataset-selection .ewsNavButton', function () {
      var
        period, type;

      $(this)
        .parent()
          .find('.ewsNavButton')
            .removeClass('selected')
          .end()
        .end()
        .addClass('selected');

      period = $('#ews-sc-history-period-selection .selected').data('timeRange');
      type = $('#ews-sc-history-dataset-selection .selected').data('type');

      _this.filter(period, type);
    });
}
// end: SC HISTORY

// SETTINGS
var EwsSettings = function () {
  var intv;
  var _this = this;
  var settings = {
    'ews-auto-refresh-showmeme': false,
    'ews-custom-highlight': false,
    'ews-submit-using-spacebar': false,
    'ews-accu-bars': true
  };
  var settingsName = account.account.uid + '-ews-settings';

  var stored = Utils.ls.get('settings');
  if(stored) {
    $.extend(settings, JSON.parse(stored));
  }


  this.get = function(setting) {
    return settings[setting];
  };


  $('#settingsMenu').append(`
    <div id="ews-settings-group" class="settings-group ews-settings-group invisible">
      <h1>Stats Settings</h1>
    </div>
  `);

  function add(name, id) {
    $('#ews-settings-group').append(`
      <div class="setting">
        <span>` + name + `</span>
        <div class="checkbox">
          <div class="checkbox-handle"></div>
          <input type="checkbox" id="` + id + `" style="display: none;">
        </div>
      </div>
    `);
  }

  if (account.roles.scout) {
    add('Custom Highlight', 'ews-custom-highlight');

    $('#ews-settings-group').append(`
      <div id="ews-custom-highlight-color-label" style="display: ` + (_this.get('ews-custom-highlight') ? 'block' : 'none') + `">
        Highlight Color
        <div id="ews-custom-highlight-color"></div>
      </div>
    `);

    Utils.gid('ews-custom-highlight-color').style.backgroundColor = Utils.ls.get('custom-highlight-color') || '#929292';

    function applyColor(color) {
      var
        clr = color.toHexString();

      Utils.gid('ews-custom-highlight-color').style.backgroundColor = clr;
      Utils.ls.set('custom-highlight-color', clr);

      if (highlight) {
        highlight.refresh();
      }
    }

    $('#ews-custom-highlight-color').spectrum({
      showInput: true,
      preferredFormat: 'hex',
      color: Utils.ls.get('custom-highlight-color') || '#929292',
      containerClassName: 'ews-color-picker',
      replacerClassName: 'ews-color-picker',
      move: applyColor,
      change: applyColor
    });

    $('.sp-cancel, .sp-choose').addClass('minimalButton');
  }

  if (account.roles.scythe || account.roles.mystic) {
    add('Auto Refresh ShowMeMe', 'ews-auto-refresh-showmeme');
  }

  add('Submit using Spacebar', 'ews-submit-using-spacebar');
  add('Show Accuracy Bars', 'ews-accu-bars');

  this.set = function(setting, value) {
    settings[setting] = value;
    Utils.ls.set('settings', JSON.stringify(settings));
  };

  this.getAll = function () {
    return settings;
  };


  // source: crazyman's script
  $('#ews-settings-group input').each(function() {
    var
    elem, pref, sets;

    elem = $(this);
    pref = this.id;
    sets = _this.getAll();

    this.checked = sets[pref];
    elem.add(elem.closest('.checkbox')).removeClass(sets[pref] ? 'off' : 'on').addClass(sets[pref] ? 'on' : 'off');
    $(document).trigger('ews-setting-changed', {setting: pref, state: sets[pref]});
  });


  $('#ews-settings-group input').closest('div.setting').click(function(evt) {
    var
      $elem, elem, newState;

    $elem = $(this).find('input');
    elem = $elem[0];
    newState = !elem.checked;

    evt.stopPropagation();

    elem.checked = newState;
    _this.set(elem.id, newState);
    $elem.add($elem.closest('.checkbox')).removeClass(newState ? 'off' : 'on').addClass(newState ? 'on' : 'off');
    $(document).trigger('ews-setting-changed', {setting: elem.id, state: newState});
  });

  $(document).on('ews-setting-changed', function (evt, data) {
    if (data.setting === 'ews-custom-highlight') {
      $('#ews-custom-highlight-color-label')[data.state ? 'slideDown' : 'slideUp']();
    }
  });
};
// end: SETTINGS

// CUSTOM HIGHLIGHT
function CustomHighlight() {
  var
    _this = this,
    currentCellId = '',
    highlightButton = document.querySelector('.control.highlight button');

  $('body').append('<div id="ewsCustomHighlightedCells"><div id="ewsCustomHighlightedCellsWrapper"></div></div>');

   $('#ewsCustomHighlightedCells').dialog({
    autoOpen: false,
    hide: true,
    modal: true,
    show: true,
    dialogClass: 'ews-dialog',
    title: 'Cells containing your Custom Highlighted cubes',
    width: 800,
    open: function (event, ui) {
      $('.ui-widget-overlay').click(function() { // close by clicking outside the window
        $('#ewsCustomHighlightedCells').dialog('close');
      });
    }
  });

  // adding names and dataset_ids for cells with cubes highlighted pre-1.5
  if (!Utils.ls.get('custom-highlight-updated')) {
    Utils.ls.set('custom-highlight-updated', true);
    db.openCursor(function (cursor) {
      let cellName;

      if (cursor) {
        (function (crsr) {
          $.getJSON('https://eyewire.org/1.0/cell/' + crsr.value.cellId, function (data) {
            if (data) {
              crsr.value.name = data.name;
              crsr.value.datasetId = data.dataset_id;
              db.put(crsr.value);
            }
          });
        })(cursor);
        cursor.continue();
      }
    });
  }

  $('#cubeInspectorFloatingControls .controls').append(`
    <div class="control custom-highlight">
      <div class="children translucent flat active" title="Custom Highlight Children (v + up)">
        <div class="down-arrow"></div>
      </div>
      <button class="cube translucent flat minimalButton active" title="Custom Highlight" disabled="">V</button>
      <div class="parents translucent flat active" title="Custom Highlight Parents (v + down)">
        <div class="up-arrow"></div>
      </div>
    </div>

    <div class="control custom-unhighlight">
      <div class="children translucent flat active" title="Custom Unhighlight Children (b + up)">
        <div class="down-arrow"></div>
      </div>
      <button class="cube translucent flat minimalButton active" title="Custom Unhighlight" disabled="">B</button>
      <div class="parents translucent flat active" title="Custom Unhighlight Parents (b + down)">
        <div class="up-arrow"></div>
      </div>
    </div>
  `);

  $('.custom-highlight, .custom-unhighlight').css('display', settings.get('ews-custom-highlight') ? 'block' : 'none');
  highlightButton.disabled = !settings.get('ews-custom-highlight');
  highlightButton.classList.toggle('active', settings.get('ews-custom-highlight'));


  function getColor() {
    return  Utils.ls.get('custom-highlight-color') || '#929292';
  }

  this.highlight = function (cellId, cubeIds) {
    // zindex = 1, because the higlights object is processed using .forEach(), where the order of the indices
    // doesn't matter. Only order of adding items is importans. By default the object
    // consists of objects with keys {1, 5, 6, 100}, so no matter, if I add 2, 10 or 1000, that
    // object will always be procceded at the end overwriting settings from the previous objects
    // Luckily, the {1} objects seems to ne unused, while it can be still used for the Custom Highlighting
    // and the order in the highlights object won't change
    tomni.getCurrentCell().highlight({cubeids: cubeIds, color: getColor(), zindex: 1});
    tomni.getCurrentCell().update();
  };

  this.unhighlight = function (cellId) {
    tomni.getCurrentCell().unhighlight([1]);
    tomni.getCurrentCell().update();
  };

  this.highlightCell = function () {
    var
      cellId = this.getCurrentCellId();

      if (cellId !== currentCellId) {
        db.get(cellId, function (result) {
          if (result) {
            _this.highlight(cellId, result.cubeIds);
            currentCellId = cellId;
          }
        });
      }
  };

  this.getCurrentCubeId = function () {
    return tomni.getTarget()[0].id;
  };

  this.getCurrentCellId = function () {
    return tomni.getCurrentCell().id;
  };

  this.add = function (direction) {
    var
      cubes, cellName,
      cubeId = this.getCurrentCubeId(),
      cellId = this.getCurrentCellId();

    if (direction && (direction.parents || direction.children)) {
      this.addRelatives(direction, cubeId);
    }
    else {
      db.get(cellId, function (result) {
        if (!result) {
          cubes = [cubeId];
          cellName = tomni.getCurrentCell().info.name;
        }
        else {
          // source: https://stackoverflow.com/a/38940354
          cubes = [...new Set([...result.cubeIds, cubeId])];
          cellName = result.name;
        }
        db.put({cellId: cellId, cubeIds: cubes, timestamp: Date.now(), name: cellName, datasetId: tomni.getCurrentCell().info.dataset_id}, function () {
          _this.highlight(cellId, cubes);
        });
      });
    }
  };


  this.addRelatives = function (direction, self) {
    var
      dataToUse, cubes, cellName,
      cellId = this.getCurrentCellId();

    $.getJSON('/1.0/task/' + self + '/hierarchy', function (data) {
      dataToUse = direction.parents ? data.ancestors : data.descendants;
      db.get(cellId, function (result) {
        if (!result) {
          cubes = [...dataToUse, self];
          cellName = tomni.getCurrentCell().info.name;
        }
        else {
          cubes = [...new Set([...result.cubeIds, ...dataToUse, self])];
          cellName = result.name;
        }
        db.put({cellId: cellId, cubeIds: cubes, timestamp: Date.now(), name: cellName, datasetId: tomni.getCurrentCell().info.dataset_id}, function () {
          _this.highlight(cellId, cubes);
        });
      });
    });
  };


  this.remove = function (direction) {
    var
      index, cell, cubes,
      cubeId = this.getCurrentCubeId(),
      cellId = this.getCurrentCellId();

    if (direction && (direction.parents || direction.children)) {
      this.removeRelatives(direction, cubeId);
    }
    else {
      db.get(cellId, function (result) {
        if (result) {
          index = result.cubeIds.indexOf(cubeId);
          if (index > -1) {
            result.cubeIds.splice(index, 1);
            result.timestamp = Date.now();
            db.put(result);
            _this.highlight(cellId, cubes);
          }
        }
      });
    }
  };


  this.removeRelatives = function (direction, self) {
    var
      dataToUse,
      cellId = this.getCurrentCellId();

    $.getJSON('/1.0/task/' + self + '/hierarchy', function (data) {
      dataToUse = direction.parents ? data.ancestors : data.descendants;
      dataToUse.push(self);
      db.get(cellId, function (result) {
        var cubes;

        if (result) {
          // source: https://stackoverflow.com/a/33034768
          cubes = result.cubeIds.filter(x => dataToUse.indexOf(x) == -1);
          result.cubeIds = cubes;
          result.timestamp = Date.now();
          db.put(result);
          _this.highlight(cellId, cubes);
        }
      });
    });
  };

  this.removeCell = function (cellId) {
    db.delete(cellId, function () {
      if (cellId == tomni.cell) {
        _this.unhighlight();
      }
    });
  }

  this.refresh = function () {
    var
      cellId = this.getCurrentCellId();

      db.get(cellId, function (result) {
        if (result) {
          _this.highlight(cellId, result.cubeIds);
        }
      });
  };


  this.showList = function () {
    var
      html = '';

    html += `
      <div class="ewsNavButtonGroup" id="ews-custom-highlight-period-selection">
        <div class="ewsNavButton" data-time-range="day">last 24h</div>
        <div class="ewsNavButton" data-time-range="week">last 7 days</div>
        <div class="ewsNavButton" data-time-range="month">last 30 days</div>
        <div class="ewsNavButton selected" data-time-range="allthetime">all the time</div>
      </div>
      <div class="ewsNavButtonGroup" id="ews-custom-highlight-dataset-selection">
        <div class="ewsNavButton" data-type="1">Mouse's Retina</div>
        <div class="ewsNavButton" data-type="11">Zebrafish's Hindbrain</div>
        <div class="ewsNavButton selected" data-type="both">Both</div>
      </div>
    `;
    html += '<table id="ews-custom-highlight-results">';
    html += `<thead><tr>
      <th># of Highlights</th>
      <th>Cell Name</th>
      <th>Cell ID</th>
      <th>Timestamp</th>
      <th>&nbsp;</th>
    </tr></thead>`;
    html += '<tbody>';

    db.openCursor(function (cursor) {
      if (cursor) {
        html += `<tr
          data-cell-id="` + cursor.value.cellId + `"
          data-timestamp="` + cursor.value.timestamp + `"
          data-dataset-id="` + cursor.value.datasetId + `"
        >
          <td>` + cursor.value.cubeIds.length + `</td>
          <td class="custom-highlighted-cell-name">` + cursor.value.name + `</td>
          <td>` + cursor.value.cellId + `</td>
          <td>` + (new Date(cursor.value.timestamp)).toLocaleString() + `</td>
          <td><button class="minimalButton">Remove</button></td>
        </tr>`;
        cursor.continue();
      }
      else {
        html += '</tbody></table>';

        Utils.gid('ewsCustomHighlightedCellsWrapper').innerHTML = html;
        $('#ewsCustomHighlightedCells').dialog('open');
      }
    });
  };


  this.filter = function (period, type) {
    var
      range,
      day = 1000 * 60 * 60 * 24,
      now = Date.now(),
      rows = document.querySelectorAll('#ews-custom-highlight-results tbody tr');

      switch (period) {
        case 'day': range = now - day; break;
        case 'week': range = now - 7 * day; break;
        case 'month': range = now - 30 * day; break;
        case 'allthetime': range = 0; break;
      }


      for (let row of rows) {
        if (row.dataset.timestamp >= range && (type === 'both' || row.dataset.datasetId == type)) {
          row.style.display = 'table-row';
        }
        else {
          row.style.display = 'none';
        }
      }
  };



  // source: https://stackoverflow.com/a/10828021
  Utils.injectJS(`
    $(window)
      .on(InspectorPanel.Events.ModelFetched, function () {
        $(document).trigger('model-fetched-triggered');
      })
      .on('cell-info-ready', function (e, data) {
        $(document).trigger('cell-info-ready-triggered', data);
      })
      .on('cube-leave', function (e, data) {
        $(document).trigger('cube-leave-triggered', data);
      })
      .on('keyup.InspectorPanel.HotKeys', function (e) {
        e.type = 'hotkey-event-triggered';
        $(document).trigger(e);
      });
  `);

  $(document).on('cell-info-ready-triggered', function () {
    if (settings.get('ews-custom-highlight')) {
      _this.highlightCell();
    }
  });

  $(document).on('cube-leave-triggered', function () {
    if (settings.get('ews-custom-highlight')) {
      _this.refresh();
    }
  });

  $(document).on('model-fetched-triggered', function () {
    if (tomni.getTarget()) {
      $('.custom-highlight button').css({
        'color': '#00CC00',
        'border-color': '#00CC00',
        'cursor': 'pointer'
      })
      .addClass('active')
      .prop('disabled', false);

      $('.custom-unhighlight button').css({
        'color': '#FFA500',
        'border-color': '#FFA500',
        'cursor': 'pointer'
      })
      .addClass('active')
      .prop('disabled', false);
    }
    else {
      $('.custom-highlight button').css({
        'color': '#e4e1e1',
        'border-color': '#434343',
        'cursor': 'auto'
      })
      .removeClass('active')
      .prop('disabled', true);

      $('.custom-unhighlight button').css({
        'color': '#e4e1e1',
        'border-color': '#434343',
        'cursor': 'auto'
      })
      .removeClass('active')
      .prop('disabled', true);
    }
  })
  .on('click', '#ews-custom-highlight-period-selection .ewsNavButton, #ews-custom-highlight-dataset-selection .ewsNavButton', function () {
      var
        period, type;

      $(this)
        .parent()
          .find('.ewsNavButton')
            .removeClass('selected')
          .end()
        .end()
        .addClass('selected');

      period = $('#ews-custom-highlight-period-selection .selected').data('timeRange');
      type = $('#ews-custom-highlight-dataset-selection .selected').data('type');

      _this.filter(period, type);
    });

  // source: https://beta.eyewire.org/static/js/omni.js
  var controlset = ['highlight', 'unhighlight'];
  var BUTTON_DESCRIPTIONS = {
    highlight: {
      hotkey: 'v',
      options: ['cube', 'parents', 'children'],
      fn: _this.add
    },
    unhighlight: {
      hotkey: 'b',
      options: ['cube', 'parents', 'children'],
      fn: _this.remove
    }
  };

  var _hotkeys = {};

  controlset.forEach(function (name) {
    var desc = BUTTON_DESCRIPTIONS[name];
    var basekey = desc.hotkey;

    if (desc.options.indexOf('cube') !== -1) {
      _hotkeys[basekey + basekey] = desc.fn.bind(_this);
    }
    if (desc.options.indexOf('parents') !== -1) {
      _hotkeys[basekey + 'up'] = desc.fn.bind(_this, {parents: true});
    }
    if (desc.options.indexOf('children') !== -1) {
      _hotkeys[basekey + 'down'] = desc.fn.bind(_this, {children: true});
    }
  });

  $(document).on('hotkey-event-triggered', function (evt) {
    if (tomni.gameMode || !settings.get('ews-custom-highlight')) {
      return;
    }


    var prevkeys = Keycodes.lastKeys(1).join('');

    if (Keycodes.keys[evt.keyCode] !== prevkeys) {
      return;
    }

    var fn;
    prevkeys = Keycodes.lastKeys(2).join('');
    fn = _hotkeys[prevkeys];

    var exceptions = ['enter', 'mm', 'hh', 'hup', 'hdown'];

    if (fn) {
      fn();
      Keycodes.flush(2);
    }
  });

  $(document)
    .on('click', '.custom-highlight button', function () {
      if ($(this).hasClass('active')) {
        // if (this.classList.contains('active')) {}
        _this.add();
      }
    })
    .on('click', '.custom-unhighlight button', function () {
      if ($(this).hasClass('active')) {
        _this.remove();
      }
    })
    .on('click', '.custom-highlight .down-arrow', function () {
      if ($('.custom-highlight button').hasClass('active')) {
        _this.add({children: true});
      }
    })
    .on('click', '.custom-unhighlight .down-arrow', function () {
      if ($('.custom-unhighlight button').hasClass('active')) {
        _this.remove({children: true});
      }
    })
    .on('click', '.custom-highlight .up-arrow', function () {
      if ($('.custom-highlight button').hasClass('active')) {
        _this.add({parents: true});
      }
    })
    .on('click', '.custom-unhighlight .up-arrow', function () {
      if ($('.custom-unhighlight button').hasClass('active')) {
        _this.remove({parents: true});
      }
    })
    .on('click', '.control.highlight button', function () {
      if ($(this).hasClass('active')) {
        _this.showList();
      }
    });

  $(document)
    .on('click', '.custom-highlighted-cell-name', function () {
      tomni.setCell({id: this.nextElementSibling .innerHTML});
    })
    .on('click', '#ewsCustomHighlightedCellsWrapper button', function () {
      var
        cellId = this.parentNode.previousElementSibling.previousElementSibling.innerHTML,
        row = this.parentNode.parentNode;

      _this.removeCell(parseInt(cellId, 10));
      row.remove();
    });

  function recalculateFloatingControlPanelWidth() {
    var
      width, windowWidth, rootWidth,
      root, controls, info,
      rootLeft;

    root = $('#cubeInspectorFloatingControls');
    controls = $('#cubeInspectorFloatingControls .controls');
    info = $('#cubeInspectorFloatingControls .info');

    width = controls.outerWidth(true);
    width += info.outerWidth(true);
    width += root.outerWidth(false) - root.innerWidth();

    root.css('width', width + 'px');

    windowWidth = $(window).width();
    rootLeft = parseInt(root.css('left'), 10);
    rootWidth = root.width();

    if (rootLeft > windowWidth || rootLeft + rootWidth > windowWidth) {
      root.css('left', (windowWidth - rootWidth) + 'px');
    }
  }

  $(document).on('ews-setting-changed', function (evt, data) {
    if (data.setting === 'ews-custom-highlight') {
      if (data.state) {
        db.get(tomni.cell, function (data) {
          _this.highlight(tomni.cell, data.cubeIds);
        });
        $('.custom-highlight, .custom-unhighlight').css('display', 'block');
        document.querySelector('.control.highlight button').disabled = false;
        recalculateFloatingControlPanelWidth();
      }
      else {
        _this.highlight(tomni.cell, []);
        $('.custom-highlight, .custom-unhighlight').css('display', 'none');
        document.querySelector('.control.highlight button').disabled = true;
        recalculateFloatingControlPanelWidth();
      }
    }
  });
}
// end: CUSTOM HIGHLIGHT




Utils.addCSSFile('https://chrisraven.github.io/EWStats/EWStats.css?v=4');
Utils.addCSSFile('https://chrisraven.github.io/EWStats/jquery-jvectormap-2.0.3.css');
Utils.addCSSFile('https://chrisraven.github.io/EWStats/spectrum.css?v=3');



// source: https://stackoverflow.com/a/14488776
// to allow html code in the title option of a dialog window
$.widget('ui.dialog', $.extend({}, $.ui.dialog.prototype, {
  _title: function(title) {
    if (!this.options.title) {
      title.html('&#160;');
    }
    else {
      title.html(this.options.title);
    }
  }
}));


var
  history,
  highlight,
  db;

var settings = new EwsSettings();
var panel = new StatsPanel();
var chart = new AccuChart();



if (account.roles.scout) {
  db = new Database();
  highlight = new CustomHighlight();
  if (localStorage.getItem('ews-highlight-data')) { // migrating from localStorage to IndexedDB
    let ls = JSON.parse(localStorage.getItem('ews-highlight-data'));
    for (let cellId in ls) {
      db.put({cellId: cellId, cellIds: ls[cellId], timestamp: Date.now()});
    }
    localStorage.removeItem('ews-highlight-data');
  }
}

if (account.roles.scythe || account.roles.mystic) {
  history = new SCHistory();
  history.removeOldEntries();
}



var originalSaveTask = tomni.taskManager.saveTask;
tomni.taskManager.saveTask = function() {
  chart.getCubeData(arguments);
  originalSaveTask.apply(this, arguments);
};



// submit using Spacebar
$('body').keydown(function (evt) {
  var
    btn;

  if (evt.keyCode === 32 && tomni.gameMode && settings.get('ews-submit-using-spacebar')) {
    if (!tomni.task.inspect) {
      btn = Utils.gid('actionGo');
    }
    else {
      if (account.roles.scythe || account.roles.mystic) {
        btn = Utils.gid('saveGT');
      }
      else {
        btn = Utils.gid('flagCube');
      }
    }

    if (btn) {
      evt.stopPropagation();
      btn.click();
    }
  }
});
// end: submit using Spacebar


} // end: main()

})(); // end: wrapper
