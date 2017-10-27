// ==UserScript==
// @name         EyeWire Statistics
// @namespace    http://tampermonkey.net/
// @version      1.4.1
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
        targ,
        scriptNode = document.createElement('script');

      scriptNode.type = "text/javascript";
      if (text) {
        scriptNode.textContent = text;
      }
      if (sURL) {
        scriptNode.src = s_URL;
      }

      targ = document.getElementsByTagName('head')[0] || document.body || document.documentElement;
      targ.appendChild(scriptNode);
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
      localStorage.setItem(account.account.uid + '-ews-hide-buttons', lsData['ew-hide-buttons']);
      localStorage.removeItem('ew-hide-buttons');
    }
    
    if (lsData['ews-settings']) {
      localStorage.setItem(account.account.uid + '-ews-settings', lsData['ews-settings']);
      localStorage.removeItem('ews-settings');
    }
    
    if (lsData['ewsAccuData']) {
      localStorage.setItem(account.account.uid + '-ews-accu-data', lsData['ewsAccuData']);
      localStorage.removeItem('ewsAccuData');
    }
    
    if (lsData['ewsLastHighlighted']) {
      localStorage.setItem(account.account.uid + '-ews-last-highlighted', lsData['ewsLastHighlighted']);
      localStorage.removeItem('ewsLastHighlighted');
    }
    
    if (lsData['ewsSCHistory']) {
      localStorage.setItem(account.account.uid + '-ews-sc-history', lsData['ewsSCHistory']);
      localStorage.removeItem('ewsSCHistory');
    }
    
    if (lsData['overview-draggable']) {
      localStorage.setItem(account.account.uid + '-ews-overview-draggable', lsData['overview-draggable']);
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
  }
  // end: indexedDB
  

// STATS PANEL
function StatsPanel() {
  var
    panel = Utils.gid('ewsPanel'),
    chart,
    dataCurrentlyInUse,
    countries = JSON.parse(GM_getResourceText('countries'));


  this.map = null;
  this.dataType = 'points';
  this.timeRange = 'day';


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
    var
      _this = this;

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
      _this = this,
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
      panel.map.updateSize();
      panel.getData();
    }
  });

  $('#ewsLink').click(function () {
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
      panel.dataType = data.dataType;
    }
    else if (data.timeRange) {
      panel.timeRange = data.timeRange;
    }
    panel.getData();
  });

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
    refreshData = false;


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

    localStorage.setItem(account.account.uid + '-ews-last-highlighted', id);
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
      _this = this,
      waiting = 2;

    document.getElementsByClassName('accu-refresh-progress-bar')[0].value = 100;

    if (!refreshData) {
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

      localStorage.setItem(account.account.uid + '-ews-accu-data', JSON.stringify(accuData));
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

      localStorage.setItem(account.account.uid + '-ews-accu-data', JSON.stringify(accuData));
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
      values = localStorage.getItem(account.account.uid + '-ews-accu-data'),
      lastHighlightedBar = localStorage.getItem(account.account.uid + '-ews-last-highlighted');

    $('body').append(
      '<div id="accuracy-container">' +
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
    localStorage.setItem(account.account.uid + '-ews-accu-data', JSON.stringify(accuData));
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
    localStorage.setItem(account.account.uid + '-ews-accu-data', JSON.stringify(accuData));
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
  
  
  $(document).on('cube-submission-data', function (event, data) {
    var
      cubeId = chart.cubeData.cubeId,
      cellId = chart.cubeData.cellId,
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
        chart.updateAccuracyWeight(weight);
        barId = chart.wasRecentlyPlayed(cubeId);
        if (barId !== -1) {
          chart.updatePlayedAccuracyBar(action, barId, val, weight, data.score, timestamp);
        }
        else {
          chart.addAccuracyBar(action, val, weight, tomni.getCurrentCell().info.difficulty, data.score, cellId, cubeId, timestamp);
        }
      });
      chart.updateAccuracyValue(val);
      }, 100);
  });

  $('#accuracy-bars-wrapper-2')
    .on('mouseenter', '.accuracy-bar-cover-2', function(event) {
      var
        html, action, val,
        lbl = Utils.gid('accu-floating-label'),
        data = JSON.parse(this.nextSibling.dataset.accuracy);

      if (!data || typeof data.val === 'undefined') {
        return;
      }

      lbl.style.display = 'block';
      lbl.style.width = '230px';
      lbl.style.height = '160px';
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
      html += '<tr><td>Weight</td><td>' + data.wt.toFixed(1) + '</td></tr>';
      html += '<tr><td>Score</td><td>' + data.score + '</td></tr>';
      html += '<tr><td>Cell ID</td><td>' + data.cellId + '</td></tr>';
      html += '<tr><td>Cube ID</td><td>' + data.cubeId + '</td></tr>';
      html += '<tr><td>Timestamp</td><td>' + data.timestamp + '</td></tr>';
      html += '</table>';
      lbl.innerHTML = html;
  })
  .on('mouseleave', '.accuracy-bar-cover-2', function(event) {
    Utils.gid('accu-floating-label').style.display = 'none';
  })
  .on('click', '.accuracy-bar-cover-2', function (event) {
    var
      data = JSON.parse(this.nextSibling.dataset.accuracy);

    if (!data || typeof data.cubeId === 'undefined') {
      return false;
    }

    tomni.jumpToTaskID(data.cubeId);
  })
  .on('contextmenu', '.accuracy-bar-cover-2', function (event) {
    var
      data = JSON.parse(this.nextSibling.dataset.accuracy);

    if (!data || typeof data.cubeId === 'undefined') {
      return false;
    }

    window.open(window.location.origin + "?tcJumpTaskId=" + data.cubeId);
  });

  $('#accuracy-weight-stripe')
    .on('mouseenter', function () {
      var
        html = '',
        lbl = Utils.gid('accu-floating-label');

      lbl.style.width = '190px';
      lbl.style.height = '120px';
      lbl.style.display = 'block';
      lbl.style.left = this.getBoundingClientRect().left + 'px';
      lbl.style.top = this.getBoundingClientRect().bottom + 'px';

      function div(weight) {
        return '<div class="accu-wt-lbl-cell" style="background-color: ' + chart.weightToColor(weight) + ';"></div>';
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

  $('#more-less-button').click(function () {
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
  });
}
// end: ACCURACY CHART


// SC HISTORY
function SCHistory() {
  var
    stringFunc;

  $('body').append('<div id="ewsSCHistory"><div id="ewsSCHistoryWrapper"></div></div>');

  $('#ewsSCHistory').dialog({
    autoOpen: false,
    hide: true,
    modal: true,
    show: true,
    dialogClass: 'ews-dialog',
    title: 'Cubes completed in cells SCed during last 7 days',
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
            $(document).trigger('votes-updated', {cellId: tomni.cell, cellName: tomni.getCurrentCell().info.name});
          }
        }, false);
        open.call(this, method, url, async, user, pass);
      };
    }) (XMLHttpRequest.prototype.open)
  `);

  this.updateCount = function (count, cellId, cellName, timestamp) {
    var
      lsHistory = localStorage.getItem(account.account.uid + '-ews-sc-history');

    if (lsHistory && lsHistory !== '{}') {
      lsHistory = JSON.parse(lsHistory);
    }
    else {
      lsHistory = {};
    }

    lsHistory[cellId] = {count: count, ts: timestamp, name: cellName};

    localStorage.setItem(account.account.uid + '-ews-sc-history', JSON.stringify(lsHistory));
  };

  this.removeOldEntries = function () {
    var
      cellId,
      now = Date.now(),
      sevenDays = 1000 * 60 * 60 * 24 * 7,
      lsHistory = localStorage.getItem(account.account.uid + '-ews-sc-history');

    if (lsHistory && lsHistory !== '{}') {
      lsHistory = JSON.parse(lsHistory);
      for (cellId in lsHistory) {
        if (lsHistory.hasOwnProperty(cellId)) {
          if (now - lsHistory[cellId].ts > sevenDays) {
            delete lsHistory[cellId];
          }
        }
      }
      localStorage.setItem(account.account.uid + '-ews-sc-history', JSON.stringify(lsHistory));
    }
  };

  this.updateDialogWindow = function () {
    var
      cellId,
      html, el,
      threshold,
      lsHistory = localStorage.getItem(account.account.uid + '-ews-sc-history');

    if (lsHistory && lsHistory !== '{}') {
      lsHistory = JSON.parse(lsHistory);
      html = '<table><tr><th># of SCs</th><th>Cell Name</th><th>Cell ID</th><th>Timestamp</th><th>sc-info</th><th>sc-info Results<th></tr>';
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
          html += '<tr><td' + threshold + '>' + el.count + '</td><td class="sc-history-cell-name">' + el.name + '</td><td class="sc-history-cell-id">' + cellId + '</td><td>' + (new Date(el.ts)).toLocaleString() + '</td><td><button class="sc-history-check-button minimalButton">Check</button><td class="sc-history-results"></td></tr>';
        }
      }
      html += '</table>';
    }
    else {
      html = 'no cubes SCed for last 7 days or since installing the script';
    }

    Utils.gid('ewsSCHistoryWrapper').innerHTML = html;
  };


  $(document)
    .on('contextmenu', '#profileButton', function (e) {
      e.preventDefault();
      e.stopPropagation();
      history.updateDialogWindow();
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

        history.updateCount(JSONData.scythe[uid].length, _data.cellId, _data.cellName, Date.now());

        if (!btn.hasClass('on1') && settings.get(account.account.uid + '-ews-auto-refresh-showmeme')) {
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
      tomni.setCell({id: this.nextSibling.innerHTML});
    })
    .on('click', '.sc-history-check-button', function () {
      var
        _this = this,
        semaphore = 3,
        tasks, scytheData, completeData, myTasks,
        cellId = this.parentNode.previousSibling.previousSibling.innerHTML;

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

            _this.parentNode.nextSibling.innerHTML = "Cubes you can SC: " + potentialTasks.length;

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
    'ews-submit-using-spacebar': false
  };
  var settingsName = account.account.uid + '-ews-settings';

  var stored = localStorage.getItem(settingsName);
  if(stored) {
    $.extend(settings, JSON.parse(stored));
  }
  
  $('#settingsMenu').append(`
    <div id="ews-settings-group" class="settings-group ews-settings-group invisible">
      <h1>Stats Settings</h1>
    </div>
  `);
  
  function add(name, id) {
    $('#ews-settings-group').append(`
      <div class="setting">
        <span>` + name + `</span>
        <input type="checkbox" id="` + id + `" style="display: none;">
      </div>
    `);
  }
  
  if (account.roles.scout) {
    add('Custom Highlight (beta)', 'ews-custom-highlight');

    $('#ews-settings-group').append(`
      <div id="ews-custom-highlight-color-label">
        Highlight Color
        <div id="ews-custom-highlight-color"></div>
      </div>
    `);
    
    Utils.gid('ews-custom-highlight-color').style.backgroundColor = localStorage.getItem(account.account.uid + '-ews-custom-highlight-color') || '#000000';

    $('#ews-custom-highlight-color').spectrum({
      showInput: true,
      preferredFormat: 'hex',
      showButtons: false,
      color: localStorage.getItem(account.account.uid + '-ews-custom-highlight-color') || '#929292',
      move: function(color) {
        var
          clr = color.toHexString();

        Utils.gid('ews-custom-highlight-color').style.backgroundColor = clr;
        localStorage.setItem(account.account.uid + '-ews-custom-highlight-color', clr);
        
        if (highlight) {
          highlight.refresh();
        }
      }
    });
  }

  if (account.roles.scythe || account.roles.mystic) {
    add('Auto Refresh ShowMeMe', 'ews-auto-refresh-showmeme');
  }
  
  add('Submit using Spacebar', 'ews-submit-using-spacebar');

  this.set = function(setting, value) {
    settings[setting] = value;
    localStorage.setItem(settingsName, JSON.stringify(settings));
  };

  this.get = function(setting) {
    return settings[setting];
  };
  
  this.getAll = function () {
    return settings;
  };
  
  
// source: crazyman's script
  $('#ews-settings-group input').checkbox().each(function() {
    var elem = $(this);
    var input = elem.find('input');
    var pref = input.prop('id');
    var sets = _this.getAll();

    $(document).trigger('ews-setting-changed', {setting: pref, state: sets[pref]});

    if(sets[pref]) {
      elem.removeClass('off').addClass('on');
    }
    else {
      elem.removeClass('on').addClass('off');
    }
  });

  $('#ews-settings-group input').change(function(e) {
    e.stopPropagation();
    _this.set(this.id, this.checked);
    $(document).trigger('ews-setting-changed', {setting: this.id, state: this.checked});
  });

  $('#ews-settings-group .checkbox').click(function(e) {
    var elem = $(this).find('input');
    elem.prop('checked', !elem.is(':checked'));
    elem.change();
  });

  $('#ews-settings-group input').closest('div.setting').click(function(e) {
    e.stopPropagation();
    var elem = $(this).find('input');
    elem.prop('checked', !elem.is(':checked'));
    elem.change();
  });
};
// end: SETTINGS

// CUSTOM HIGHLIGHT
function CustomHighlight() {
  var
    _this = this,
    currentCellId = '';

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
  
  function getColor() {
    return  localStorage.getItem(account.account.uid + '-ews-custom-highlight-color') || '#929292';
  }

  this.highlight = function (cellId, cubeIds) {
    tomni.threeD.getCell(cellId).highlight({cubeids: cubeIds, color: getColor(), zindex: 7});
  };

  this.unhighlight = function (cellId, cubeIds) {
    tomni.threeD.getCell(cellId).unhighlight(cubeIds);
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
  }

  this.getCurrentCubeId = function () {
    return tomni.getTarget()[0].id;
  };

  this.getCurrentCellId = function () {
    return tomni.getCurrentCell().id;
  };

  this.add = function (direction) {
    var
      cubes,
      cubeId = this.getCurrentCubeId(),
      cellId = this.getCurrentCellId();

    if (direction && (direction.parents || direction.children)) {
      this.addRelatives(direction, cubeId);
    }
    else {
      db.get(cellId, function (result) {
        if (!result) {
          cubes = [cubeId];
        }
        else {
          // source: https://stackoverflow.com/a/38940354
          cubes = [...new Set([...result.cubeIds, cubeId])];
        }
        db.put({cellId: cellId, cubeIds: cubes, timestamp: Date.now()}, function () {
          _this.highlight(cellId, cubes);
          tomni.getCurrentCell().update();
        });
      });
    }
  };


  this.addRelatives = function (direction, self) {
    var
      dataToUse, cubes,
      cellId = this.getCurrentCellId();

    $.getJSON('/1.0/task/' + self + '/hierarchy', function (data) {
      dataToUse = direction.parents ? data.ancestors : data.descendants;
      db.get(cellId, function (result) {
        if (!result) {
          cubes = [...dataToUse, self];
        }
        else {
          cubes = [...new Set([...result.cubeIds, ...dataToUse, self])];
        }
        db.put({cellId: cellId, cubeIds: cubes, timestamp: Date.now()}, function () {
          _this.highlight(cellId, cubes);
          tomni.getCurrentCell().update();
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
            cubes = result.cubeIds;
            db.put({cellId: cellId, cubeIds: cubes, timestamp: Date.now()});
            _this.highlight(cellId, cubes);
            tomni.getCurrentCell().update();
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
          db.put({cellId: cellId, cubeIds: cubes, timestamp: Date.now()});
          _this.highlight(cellId, cubes);
          tomni.getCurrentCell().update();
        }
      });
    });
  };

  this.refresh = function () {
    var
      cellId = this.getCurrentCellId();
      
      db.get(cellId, function (result) {
        if (result) {
          _this.highlight(cellId, result.cubeIds);
          tomni.getCurrentCell().update();
        }
      });


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
    _this.highlightCell();
  });

  $(document).on('cube-leave-triggered', function () {
    _this.refresh();
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
    if (tomni.gameMode) {
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
    });
}
// end: CUSTOM HIGHLIGHT


function addMenuItem() {
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
}

Utils.addCSSFile('https://chrisraven.github.io/EWStats/EWStats.css?v=3');
Utils.addCSSFile('https://chrisraven.github.io/EWStats/jquery-jvectormap-2.0.3.css');
Utils.addCSSFile('https://chrisraven.github.io/EWStats/spectrum.css');

addMenuItem();
$('body').append(GM_getResourceText('base_html'));

//var settings = new EwsSettings();
var panel = new StatsPanel();
var chart = new AccuChart();

var
  settings,
  history,
  highlight,
  db;

settings = new EwsSettings();

if (account.roles.scout) {
  if (settings.get('ews-custom-highlight')) {
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
}

if (account.roles.scythe || account.roles.mystic) {
  history = new SCHistory();
  history.removeOldEntries();
}

panel.createMap();
panel.createChart('points');

chart.generateAccuracyWidgetHTML();


var originalSaveTask = tomni.taskManager.saveTask;
tomni.taskManager.saveTask = function() {
  chart.getCubeData(arguments);
  originalSaveTask.apply(this, arguments);
};



// source: https://stackoverflow.com/a/14488776
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


// submit using Spacebar
$('body').keydown(function (evt) {
  var
    btn;

  if (evt.keyCode === 32 && tomni.gameMode && settings.get(account.account.uid + '-ews-submit-using-spacebar')) {
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
