// ==UserScript==
// @name         EyeWire Statistics
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  Shows EW Statistics and adds some other functionality
// @author       Krzysztof Kruk
// @match        https://*.eyewire.org/*
// @exclude      https://*.eyewire.org/1.0/*
// @downloadURL  https://raw.githubusercontent.com/ChrisRaven/EWStats/master/ewStats.user.js
// @updateURL    https://raw.githubusercontent.com/ChrisRaven/EWStats/master/ewStats.meta.js
// @grant        GM_xmlhttpRequest
// @connect      ewstats.feedia.co
// @require      https://chrisraven.github.io/EWStats/jquery-jvectormap-2.0.3.min.js
// @require      https://chrisraven.github.io/EWStats/jquery-jvectormap-world-mill.js
// @require      https://chrisraven.github.io/EWStats/spectrum.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/Chart.js/2.6.0/Chart.min.js
// ==/UserScript==

/*jshint esversion: 6 */
/*globals $, account, indexedDB, GM_xmlhttpRequest, Chart, tomni, Keycodes, Cell, ColorUtils */

const DEBUG = false;
const TEST_SERVER_UPDATE = false;
const TEST_CLIENT_UPDATE = false;

(function() {
  'use strict';
  'esversion: 6';

  var Utils = {
    gid: function (id) {
      return document.getElementById(id);
    },
    
    qS: function (sel) {
      return document.querySelector(sel);
    },
    
    qSa: function (sel) {
      return document.querySelectorAll(sel);
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
        scriptNode.src = sURL;
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
    },
    
    date: {
      dayLengthInMs: 1000 * 60 * 60 * 24,
      // returns date in format of YYYY-MM-DD
      ISO8601DateStr: function (date) {
        return new Intl.DateTimeFormat('en-CA', {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric'
          }).format(date);
      },
      
      // returns a string in format YYYY-MM-DD calculated basing on the user time
      calculateHqDate: function () {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/New_York',
            year: 'numeric',
            month: 'numeric',
            day: 'numeric'
          }).format(Date.now());
      },

      getWeek: function (date) {
        let firstDayOfTheYear = Utils.date.firstDayOfAYear(date.getFullYear());
        let firstWednesday = 7 - firstDayOfTheYear - 3;
        if (firstWednesday <= 0) {
          firstWednesday += 7;
        }

        let startOfTheFirstWeek = firstWednesday - 3;
        let startOfTheFirstWeekDate = new Date(date.getFullYear(), 0, startOfTheFirstWeek);
        let currentWeek = Math.ceil(((date - startOfTheFirstWeekDate) / 86400000) / 7);

        return currentWeek;
      },

      // source: https://stackoverflow.com/a/16353241
      isLeapYear: function (year) {
        return ((year % 4 === 0) && (year % 100 !== 0)) || (year % 400 === 0);
      },
      
      firstDayOfAYear: function (year) {
        // 0 = Sunday, 1 = Monday, etc.
        return (new Date(year, 0, 1)).getDay();
      },
      
      numberOfWeeksInAYear: function (year) {
        // assuming, that week belongs to the year, which contains the middle day
        // of that week (which is Wednesday in case of Sun-Mon week)
        let firstDay = Utils.date.firstDayOfAYear(year);
        if (firstDay === 3 || Utils.date.isLeapYear(year) && (firstDay === 2 || firstDay === 4)) {
          return 53;
        }
        return 52;
      },

      getLast: {
        sevenDays: function (asDates = false) {
          let result = [];
          let currentHqDate = new Date(Utils.date.calculateHqDate());
          let weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          let currentDayOfWeek = currentHqDate.getDay();  
          let weekLength = 7;
          let cursor;

          if (asDates) {
            cursor = new Date();
            cursor.setTime(currentHqDate.getTime() - weekLength * Utils.date.dayLengthInMs);

            while (weekLength--) {
              result.push(new Intl.DateTimeFormat('en-CA', {
                year: 'numeric',
                month: 'numeric',
                day: 'numeric'
              }).format(cursor));
              cursor.setDate(cursor.getDate() + 1);
            }
          }
          else {
            cursor = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
            while (weekLength--) {
              if (cursor >= 6) {
                cursor -= 6;
              }
              else {
                ++cursor;
              }

              result.push(weekdays[cursor]);
            }
          }

          return result;
        },

        tenWeeks: function (asDates = false) {
          let result = [];
          let currentHqDate = new Date(Utils.date.calculateHqDate());
          let year = currentHqDate.getFullYear();
          let currentWeek = Utils.date.getWeek(currentHqDate);
          let periodLength = 10;
          // -1 below, because we want the last day of the period to be the last completed week, not the current one,
          // but +1, because we want to start at the first day of the period not from
          // before the period started
          let starter = currentWeek - periodLength - 1 + 1;
          let cursor;
          let numberOfWeeksInTheCurrentYear = Utils.date.numberOfWeeksInAYear(year);
          let numberOfWeeksInThePreviousYear = Utils.date.numberOfWeeksInAYear(year - 1);

          if (asDates) {
            if (starter <= 0) {
              year--;
              starter += numberOfWeeksInThePreviousYear;
            }
            cursor = starter;
            while (periodLength--) {
              result.push(year + '-' + (cursor < 10 ? '0' : '') + cursor);
              ++cursor;
              if (cursor >= 53) {
                if (numberOfWeeksInTheCurrentYear === 52 || cursor === 54) {
                  cursor = 1;
                  year++;
                }
              }
            }
          }
          else {
            if (starter <= 0) {
              starter += numberOfWeeksInThePreviousYear;
            }
            cursor = starter;
            while (periodLength--) {
              result.push(cursor);
              ++cursor;
              if (cursor >= 53) {
                if (numberOfWeeksInTheCurrentYear === 52 || cursor === 54) {
                  cursor = 1;
                }
              }
            }
          }
          return result;
        },

        twelveMonths: function (asDates = false) {
          let result = [];
          let currentHqDate = new Date(Utils.date.calculateHqDate());
          let months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          let currentMonth = currentHqDate.getMonth();
          let year = currentHqDate.getFullYear();
          let yearLength = 12;
          let cursor = currentMonth;
          
          // no matter what, if we substract 12 months from the current date, we'll be in the previous year
          --year;

          if (asDates) {
            result.push(year + '-' + (cursor < 9 ? '0' : '') + (cursor + 1));
            --yearLength;
            while (yearLength--) {
              if (cursor > 11) {
                cursor = 0;
                ++year;
              }
              else {
                ++cursor;
              }
              result.push(year + '-' + (cursor < 9 ? '0' : '') + (cursor + 1));
            }
          }
          else {
            result.push(months[cursor]);
            --yearLength;
            while (yearLength--) {
              if (cursor > 11) {
                cursor = 0;
              }
              else {
                ++cursor;
              }
              result.push(months[cursor]);
            }
          }

          return result;
        }
      },

      daysInMonth: function (month, year) {
        if (['April', 'June', 'September', 'November'].indexOf(month) !== -1) {
          return 30;
        }
        if (month === 'February') {
          return Utils.date.isLeapYear(year) ? 29 : 28;
        }
        return 31;
      },
      
      monthsFullNames: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    }
  };


  var intv = setInterval(function () {
    if (typeof account === 'undefined' || !account.account.uid) {
      return;
    }
    clearInterval(intv);
    main();
  }, 100);
  
  function main() {

    // migration to localStorage variables associated with an account and variables' names cleaning
    var lsData = localStorage;
    if (lsData['ews-settings']) {
      Utils.ls.set('settings', lsData['ews-settings']);
      localStorage.removeItem('ews-settings');
    }
    
    if (lsData.ewsAccuData) {
      Utils.ls.set('accu-data', lsData.ewsAccuData);
      localStorage.removeItem('ewsAccuData');
    }
    
    if (lsData.ewsLastHighlighted) {
      Utils.ls.set('last-highlighted', lsData.ewsLastHighlighted);
      localStorage.removeItem('ewsLastHighlighted');
    }
    
    if (lsData.ewsSCHistory) {
      Utils.ls.set('sc-history', lsData.ewsSCHistory);
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
  

// SC HISTORY
function SCHistory() {
  var
    _this = this;

  $('body').append('<div id="ewsSCHistory"><div id="ewsSCHistoryWrapper"></div></div>');

  $('#ewsSCHistory').dialog({
    autoOpen: false,
    hide: true,
    modal: true,
    show: true,
    dialogClass: 'ews-dialog',
    title: 'Cubes completed in cells SCed during last 30 days',
    width: 880,
    open: function (event, ui) {
      $('.ui-widget-overlay').click(function() { // close by clicking outside the window
        $('#ewsSCHistory').dialog('close');
      });
    }
  });
  
  if (!Utils.ls.get('sc-history-updated') || !Utils.ls.get('sc-history-updated-second-attempt')) {
    Utils.ls.set('sc-history-updated', true);
    Utils.ls.get('sc-history-updated-second-attempt', true);
    let scHistory = Utils.ls.get('sc-history');
    if (scHistory) {
      scHistory = JSON.parse(scHistory);
      for (let cellId in scHistory) {
        /*jshint loopfunc: true */ // declaring the anonymous function inside this  loop makes sense, because each function is a different callback for each async call
        if (scHistory.hasOwnProperty(cellId)) {
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
    let
      cellId,
      html = '',
      el, threshold,
      lsHistory = Utils.ls.get('sc-history'),
      status,
      completed3Color = Cell.ScytheVisionColors.complete3;

    if (lsHistory && lsHistory !== '{}') {
      lsHistory = JSON.parse(lsHistory);

      html += `
      <hr>
        <div>
          <div id="scHistorySearchForCompleted" class="minimalButton selected sc-history-top-menu">Search for completed cells</div>
          <div id="scHistoryRemoveCompleted" class="minimalButton selected sc-history-top-menu">Remove completed cells</div>
          <div id="sc-history-top-menu-input-wrapper">Remove cells with SC# less than <input id="scHistoryRemoveBelowTresholdInput" type="number"><div id="scHistoryRemoveBelowTresholdButton" class="minimalButton selected sc-history-top-menu">Go</div></div>
        </div>
        <hr>
        <br>
      `;

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
          <th>Status</th>
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
          
          status = el.status || '--';

          html += `<tr
          data-count="` + el.count + `"
          data-cell-id="` + cellId + `"
          data-timestamp="` + el.ts + `"
          data-dataset-id="` + el.datasetId + `"
          data-status="` + status + `"
          >
            <td` + threshold + `>` + el.count + `</td>
            <td class="sc-history-cell-name">` + el.name + `</td>
            <td class="sc-history-cell-id">` + cellId + `</td>
            <td>` + (new Date(el.ts)).toLocaleString() + `</td>
            <td><button class="sc-history-check-button minimalButton">Check</button></td>
            <td class="sc-history-results"></td>
            <td>` + (status === 'Completed' ? '<span style="color: ' + completed3Color + ';">Completed</span>' : status) + `</td>
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
    
    $('#scHistoryRemoveBelowTresholdInput').on('keypress keydown keyup', function (evt) {
      evt.stopPropagation();
    });
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
  
  $('body').append(`
    <div id="sc-history-popup" tabindex="-1">
      <span id="sc-history-remove-older">Remove all cells older than this one</span><br>
      <span id="sc-history-remove-fewer">Remove all cells with SC # lower than this one</span>
    </div>
  `);
  
  
  let removeHelper = function (lParam, rParam) {
    let type = $('#ews-sc-history-dataset-selection .selected').data('type');
    let baseCellData = Utils.gid('ewsSCHistoryWrapper').dataset;
    let data = Utils.ls.get('sc-history');
    if (!data || data === '{}') {
      return;
    }

    data = JSON.parse(data);
    for (let cellId in data) {
      if (data.hasOwnProperty(cellId)) {
        if (data[cellId][lParam] < baseCellData[rParam] && (data[cellId].datasetId == type || type === 'both')) {
          delete data[cellId];
        }
      }
    }

    Utils.ls.set('sc-history', JSON.stringify(data));
    _this.updateDialogWindow();
    // to switch back to the tab selected before updating the dialog window
    $('#ews-sc-history-dataset-selection').find('.ewsNavButton').each(function () {
      if (this.dataset.type == type) {
        this.click();
        return false;
      }
    });
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
    })
    .on('contextmenu', '.sc-history-remove-button', function (evt) {
      $('#sc-history-popup').css({
        left: evt.clientX,
        top: evt.clientY,
        display: 'block'
      });

      // copy data- attrs from the selected row to the top-most container to know
      // what rules use to remove entries
      // source: https://stackoverflow.com/a/20074111
      Object.assign(
        Utils.gid('ewsSCHistoryWrapper').dataset,
        this.parentNode.parentNode.dataset
      );

      evt.preventDefault();
    })
    .on('click', function (evt) {
      if (evt.target.id !== 'sc-history-popup') {
        Utils.gid('sc-history-popup').style.display = 'none';
      }
    })
    .on('keydown', function (evt) {
      if (evt.keyCode === 27) {
        Utils.gid('sc-history-popup').style.display = 'none';
      }
    })
    .on('click', '#sc-history-remove-older', removeHelper.bind(null, 'ts', 'timestamp'))
    .on('click', '#sc-history-remove-fewer', removeHelper.bind(null, 'count', 'count'));


  $('#ewsSCHistoryWrapper')
    .on('click', '.sc-history-cell-name', function () {
      tomni.setCell({id: this.nextElementSibling .innerHTML});
    })
    .on('click', '.sc-history-check-button', function () {
      var
        _this = this,
        cellId = this.parentNode.parentNode.dataset.cellId;

      $.when(
        $.getJSON("/1.0/cell/" + cellId + "/tasks"),
        $.getJSON("/1.0/cell/" + cellId + "/heatmap/scythe"),
        $.getJSON("/1.0/cell/" + cellId + "/tasks/complete/player")
      )
      .done(function (tasks, scythe, completed) {
        let potential, complete, uid, completedByMe;

        tasks = tasks[0];
        complete = scythe[0].complete || [];
        completed = completed[0];

        /* status =
          active: 0
          frozen: 10
          duplicate: 11
          stashed: 6 */
        
        potential = tasks.tasks.filter(x => (x.status === 0 || x.status === 11) && x.weight >= 3);

        potential = potential.map(x => x.id);

        complete = complete.filter(x => x.votes >= 2 && !account.account.admin);
        complete = complete.map(x => x.id);
        potential = potential.filter(x => complete.indexOf(x) === -1);

        uid = account.account.uid;
        completedByMe = completed.scythe[uid].concat(completed.admin[uid]);
        potential = potential.filter(x => completedByMe.indexOf(x) === -1);

        _this.parentNode.nextElementSibling.innerHTML = potential.length;
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
    })
    .on('click', '#scHistorySearchForCompleted', function () {
      let type = $('#ews-sc-history-dataset-selection .selected').data('type');
      let cells = Utils.ls.get('sc-history');
      let cell;
      
      if (! cells || cells === '{}') {
        return;
      }
      
      cells = JSON.parse(cells);
      for (let cellId in cells) {
        if (cells.hasOwnProperty(cellId)) {
          cell = cells[cellId];
          if ((!cell.status || cell.status !== 'Completed') && (cell.datasetId == type || type === 'both')) {
            $.getJSON('https://eyewire.org/1.0/cell/' + cellId, function (data) {
              if (data && data.completed !== null) {
                cell.status = 'Completed';
                // read and write to localStorage in each iteration, because otherwise
                // only the last would be saved
                let tempList = JSON.parse(Utils.ls.get('sc-history'));
                tempList[cellId].status = 'Completed';
                Utils.ls.set('sc-history', JSON.stringify(tempList));
                _this.updateDialogWindow();
                $('#ews-sc-history-dataset-selection').find('.ewsNavButton').each(function () {
                  if (this.dataset.type == type) {
                    this.click();
                    return false;
                  }
                });
              }
            });
          }
        }
      }
    })
    .on('click', '#scHistoryRemoveCompleted', function () {
      let type = $('#ews-sc-history-dataset-selection .selected').data('type');
      let cells = Utils.ls.get('sc-history');
      let cell;
      
      if (!cells || cells === '{}') {
        return;
      }
      
      cells = JSON.parse(cells);
      
      for (let cellId in cells) {
        if (cells.hasOwnProperty(cellId)) {
          cell = cells[cellId];
          if ((cell.status && cell.status === 'Completed') && (cell.datasetId == type || type === 'both')) {
            delete cells[cellId];
          }
        }
      }
      
      Utils.ls.set('sc-history', JSON.stringify(cells));
      _this.updateDialogWindow();
      $('#ews-sc-history-dataset-selection').find('.ewsNavButton').each(function () {
        if (this.dataset.type == type) {
          this.click();
          return false;
        }
      });
    })
    .on('click', '#scHistoryRemoveBelowTresholdButton', function () {
      let type = $('#ews-sc-history-dataset-selection .selected').data('type');
      let val = Utils.gid('scHistoryRemoveBelowTresholdInput').value;
      let cell;
      
      if (val && val > 0) {
        let cells = Utils.ls.get('sc-history');
        
        if (!cells || cells === '{}') {
          return;
        }
        
        cells = JSON.parse(cells);
        
        for (let cellId in cells) {
          if (cells.hasOwnProperty(cellId)) {
            cell = cells[cellId];
            if ((cell.count < val) && (cell.datasetId == type || type === 'both')) {
              delete cells[cellId];
            }
          }
        }
        
        Utils.ls.set('sc-history', JSON.stringify(cells));
        _this.updateDialogWindow();
        $('#ews-sc-history-dataset-selection').find('.ewsNavButton').each(function () {
          if (this.dataset.type == type) {
            this.click();
            return false;
          }
        });
      }
    });
}
// end: SC HISTORY

// SETTINGS
var EwsSettings = function () {
  // var intv;
  var _this = this;
  var settings = {
    'ews-auto-refresh-showmeme': false,
    'ews-custom-highlight': false,
    'ews-submit-using-spacebar': false,
    'ews-accu-bars': true
  };
  // var settingsName = account.account.uid + '-ews-settings';

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

  function applyColor(color) {
    var
      clr = color.toHexString();

    Utils.gid('ews-custom-highlight-color').style.backgroundColor = clr;
    Utils.ls.set('custom-highlight-color', clr);
    
    if (highlight) {
      highlight.refresh();
    }
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
      // let cellName;

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
      index, /*cell, */cubes,
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
  };

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

    // var exceptions = ['enter', 'mm', 'hh', 'hup', 'hdown'];

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
          if (data) {
            _this.highlight(tomni.cell, data.cubeIds);
          }
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



// TRACKER
function Tracker() {
  var _this = this;
  
  this.result = {};
  this.collectingInProgress = false;
  
  this.chart = null;
  
  $('#profStats').before(`
  <div class="profileNavButtonGroup" id="profileTimeRangeSelection">
      <div class="profileNavButton selected" data-type="current">current</div>
      <div class="profileNavButton" data-type="previous">previous</div>
      <div class="profileNavButton" data-type="best">best</div>
    </div>
  `);

  $('#profProfile').append(`
    <div id="lastChartsWrapper">
      <div class="ewsProfileHistoryButtonGroup" id="ews-profile-history-period-selection">
        <div class="ewsProfileHistoryButton selected" data-time-range="days">last 7 days</div>
        <div class="ewsProfileHistoryButton" data-time-range="weeks">last 10 weeks</div>
        <div class="ewsProfileHistoryButton" data-time-range="months">last 12 months</div>
      </div>
      <canvas id="ewsProfileHistoryChart" width=800 height=200></canvas>
    </div>
  `);

  this.changeTab = function (type) {
    var
      columnHeaders, lastRowVisible, color;

    switch (type) {
      case 'current':
        columnHeaders = ['Today', 'Week', 'Month', 'Overall'];
        lastRowVisible = true;
        color = '#bfbfbf';
        break;
      case 'previous':
        columnHeaders = ['Day', 'Week', 'Month'];
        lastRowVisible = false;
        color = '#00ee00';
        break;
      case 'best':
        columnHeaders = ['Day', 'Week', 'Month'];
        lastRowVisible = false;
        color = 'gold';
        break;
    }
    
    this.fillTable(type, columnHeaders, lastRowVisible, color);
  };

  
  function fillingHelper(res, el, property, type, period) {
    let prop = property;

    if (property === 'complete') {
      prop = 'completes';
    }

    let entry = res[type][period][prop];
    let val = entry.value;
    let targetVal;

    if (val === null || val === undefined) {
      targetVal = '&mdash;';
    }
    else if (typeof val === 'string' && val.indexOf(',') !== -1) { // built-in values (for current periods)
      targetVal = val;
    }
    else {
      targetVal = new Intl.NumberFormat('en-EN').format(val);
    }
    
    let cell = el.getElementsByClassName(property)[0];
    cell.innerHTML = targetVal;
    
    if (type === 'best') {
      cell.title = entry.date;
    }
    else {
      cell.title = '';
    }
  }
  
  function fillingHelper2(res, el, type, period) {
    fillingHelper(res, el, 'points', type, period);
    fillingHelper(res, el, 'cubes', type, period);
    fillingHelper(res, el, 'trailblazes', type, period);
    if (account.roles.scout) {
      fillingHelper(res, el, 'scythes', type, period);
      if (account.roles.scythe) {
        fillingHelper(res, el, 'complete', type, period);
      }
    }
  }
  
  this.fillTable = function (type, columnHeaders, lastRowVisible, color) {
    let table = Utils.gid('profStats');
    let day = table.getElementsByClassName('day')[0];
    let week = table.getElementsByClassName('week')[0];
    let month = table.getElementsByClassName('month')[0];
    let overall = table.getElementsByClassName('forever')[0];
    let res;

    day.firstElementChild.textContent = columnHeaders[0];
    week.firstElementChild.textContent = columnHeaders[1];
    month.firstElementChild.textContent = columnHeaders[2];
    
    if (!this.dontChangeTheData) {
      res = this.result;

      fillingHelper2(res, day, type, 'day');
      fillingHelper2(res, week, type, 'week');
      fillingHelper2(res, month, type, 'month');
    }

    if (lastRowVisible) {
      overall.style.visibility = 'visible';
      
      overall.firstElementChild.textContent = columnHeaders[3];
      
      if (!this.dontChangeTheData) {
        fillingHelper2(res, overall, type, 'overall');
      }
    }
    else {
      overall.style.visibility = 'hidden';
    }
    
    $('tbody', table).find('.points, .cubes, .trailblazes, .scythes, .complete').css({color: color});
  };


  // only tbs, scs and cplts are updated this way. Points and cubes are updated via cron job once a day directly to the server and then to the client the next day
  this.updateLocalStorage = function () {
    $.getJSON('https://eyewire.org/1.0/player/' + account.account.username + '/stats', function (data) {
      if (!data) {
        return;
      }

      let oldData = Utils.ls.get('profile-history');
      if (oldData) {
        oldData = JSON.parse(oldData);
      }
      else {
        oldData = {};
      }

      oldData[Utils.date.calculateHqDate()] = {
        day: {
          trailblazed: data.day.trailblazes,
          scythed: data.day.scythes,
          completed: data.day.complete
        },
        week: {
          trailblazed: data.week.trailblazes,
          scythed: data.week.scythes,
          completed: data.week.complete
        },
        month: {
          trailblazed: data.month.trailblazes,
          scythed: data.month.scythes,
          completed: data.month.complete
        }
      };

      Utils.ls.set('profile-history', JSON.stringify(oldData));
    });
  };


  // creates and object with date and value. Short name, because it's used quite often
  let o = function (value, date) {
    return {
      value: (value !== null && value !== undefined) ? value : null,
      date: (date !== null && date !== undefined) ? date : null
    };
  };
  
  // to make to function also available in public
  this.o = function (value, date) {
    return o(value, date);
  };

  this.getChartSettings = function (labels) {
    let lbl = 'cubes, tbs';
    if (account.roles.scout) {
      lbl += ', scythes';
      if (account.roles.scythe) {
        lbl += ', scs';
      }
    }
    return {
      'type': 'line',
      "data":{
        "labels": labels,
        "datasets": []
      },
      "options":{
        "responsive": false,
        "maintainAspectRatio": false,
        "scales":{
          'xAxes': [{
            "ticks":{
              fontColor: '#bfbfbf'
            },
            'stacked': true,
            barPercentage: 0.7,
          }],
          "yAxes":[
            {
              "ticks":{
                "beginAtZero": true,
                fontColor: '#bfbfbf'
              },
              id: 'y-axis-left',
              position: 'left',
              scaleLabel: {
                display: true,
                labelString: lbl,
                fontSize: 14,
                fontColor: '#bfbfbf'
              }
            },
            {
              "ticks":{
                "beginAtZero": true,
                fontColor: '#bfbfbf'
              },
              id: 'y-axis-right',
              position: 'right',
              scaleLabel: {
                display: true,
                labelString: 'points',
                fontSize: 14,
                fontColor: '#bfbfbf'
              }
            }
          ]
        },
        'legend':{
          'display': true,
          position: 'bottom',
          labels: {
            fontColor: '#bfbfbf'
          }
        }
      }
    };
  };
  
  
  this.addDataSeries = function (args) {
    // {settings, type, data, backgroundColor, borderColor}
    // args is an object, so settings is passed by reference, no need to return anything
    args.settings.data.datasets.push({
      type: args.type || 'line',
      label: args.label || '',
      data: args.data,
      fill: false,
      yAxisID: args.yAxisID || 'y-axis-left',
      backgroundColor: args.backgroundColor || 'white',
      borderColor: args.borderColor || 'white',
      borderWidth: args.borderWidth || 1,
      pointRadius: args.pointRadius || 3
    });
  };
  
  
  this.getDataAsArray = function (period, type) {
    let val, result = [], keys;
    let res = this.result.charts[period];

    switch (period) {
      case 'days': keys = Utils.date.getLast.sevenDays(true); break;
      case 'weeks': keys = Utils.date.getLast.tenWeeks(true); break;
      case 'months': keys = Utils.date.getLast.twelveMonths(true); break;
    }
    if (res) {
      for (let i = 0, len = keys.length; i < len; i++) {
        val = res[keys[i]] ? res[keys[i]][type] : null;
        result.push(val === null ? 0 : val);
      }
    }

    return result;
  };
  
  this.addCharts = function (period, labels, update) {
    if (update === undefined) {
      update = false;
    }

    if (this.chart && !update) {
      return;
    }
    
    if (update) {
      this.chart.data.labels.pop();
      this.chart.data.datasets.forEach((dataset) => {
          dataset.data.pop();
      });
    }
    
    this.result.charts = JSON.parse(Utils.ls.get('profile-history-charts'));

    let settings = this.getChartSettings(labels);

    this.addDataSeries({
      settings: settings,
      label: 'trailblazes',
      data: this.getDataAsArray(period, 'trailblazes'),
      backgroundColor: "rgba(200, 200, 200, 0.3)",
      borderColor: "rgb(200, 200, 200)",
    });

    this.addDataSeries({
      settings: settings,
      label: 'cubes',
      data: this.getDataAsArray(period, 'cubes'),
      backgroundColor: "rgba(0, 200, 0, 0.2)",
      borderColor: "rgb(0, 200, 0)",
    });
    
    let color = ColorUtils.hexToRGB('#FFA500');
    this.addDataSeries({
      settings: settings,
      label: 'points',
      data: this.getDataAsArray(period, 'points'),
      yAxisID: 'y-axis-right',
      backgroundColor: 'rgba(' + color.r + ', ' + color.g + ', ' + color.b + ', 0.2)',
      borderColor: '#FFA500',
    });

    if (account.roles.scout) {
      color = ColorUtils.hexToRGB(Cell.ScytheVisionColors.scythed);
      this.addDataSeries({
        settings: settings,
        label: 'scythes',
        data: this.getDataAsArray(period, 'scythes'),
        backgroundColor: 'rgba(' + color.r + ', ' + color.g + ', ' + color.b + ', 0.2)',
        borderColor: Cell.ScytheVisionColors.scythed,
      });

      if (account.roles.scythe) {
        color = ColorUtils.hexToRGB(Cell.ScytheVisionColors.complete2);
        this.addDataSeries({
          settings: settings,
          label: 'completes',
          data: this.getDataAsArray(period, 'completes'),
          backgroundColor: 'rgba(' + color.r + ', ' + color.g + ', ' + color.b + ', 0.2)',
          borderColor: Cell.ScytheVisionColors.complete2,
        });
      }
    }
    
    if (update) {
      this.chart.data.labels = settings.data.labels;
      this.chart.data.datasets = settings.data.datasets;
      this.chart.update();
    }
    else {
      let ctxChart = Utils.gid('ewsProfileHistoryChart').getContext('2d');
      this.chart = new Chart(ctxChart, settings);
      this.changeChartRange('days');
    }
  };
  
  this.changeChartRange = function (timeRange) {
    let labels = [];
    switch (timeRange) {
      case 'days':
        labels = Utils.date.getLast.sevenDays();
        break;

      case 'weeks':
        labels = Utils.date.getLast.tenWeeks();
        break;

      case 'months':
        labels = Utils.date.getLast.twelveMonths();
        break;
    }
    this.addCharts(timeRange, labels, true);
  };
  
  this.updateDataInProfile = function () {
    let intv = setInterval(function () {
      if (_this.collectingInProgress) {
        return;
      }

      let o = _this.o; // to shorten the name

      let empty = {
        day:   { points: o(), cubes: o(), trailblazes: o(), scythes: o(), completes: o() },
        week:  { points: o(), cubes: o(), trailblazes: o(), scythes: o(), completes: o() },
        month: { points: o(), cubes: o(), trailblazes: o(), scythes: o(), completes: o() }
      };

      clearInterval(intv);
      
      let table = Utils.gid('profStats');
      let day = table.getElementsByClassName('day')[0];
      let week = table.getElementsByClassName('week')[0];
      let month = table.getElementsByClassName('month')[0];
      let overall = table.getElementsByClassName('forever')[0];
      
      _this.result.current = {
        day: {
          points: o(day.getElementsByClassName('points')[0].textContent),
          cubes: o(day.getElementsByClassName('cubes')[0].textContent),
          trailblazes: o(day.getElementsByClassName('trailblazes')[0].textContent),
          scythes: o(day.getElementsByClassName('scythes')[0].textContent),
          completes: o(day.getElementsByClassName('complete')[0].textContent)
        },
        week: {
          points: o(week.getElementsByClassName('points')[0].textContent),
          cubes: o(week.getElementsByClassName('cubes')[0].textContent),
          trailblazes: o(week.getElementsByClassName('trailblazes')[0].textContent),
          scythes: o(week.getElementsByClassName('scythes')[0].textContent),
          completes: o(week.getElementsByClassName('complete')[0].textContent)
        },
        month: {
          points: o(month.getElementsByClassName('points')[0].textContent),
          cubes: o(month.getElementsByClassName('cubes')[0].textContent),
          trailblazes: o(month.getElementsByClassName('trailblazes')[0].textContent),
          scythes: o(month.getElementsByClassName('scythes')[0].textContent),
          completes: o(month.getElementsByClassName('complete')[0].textContent)
        },
        overall: {
          points: o(overall.getElementsByClassName('points')[0].textContent),
          cubes: o(overall.getElementsByClassName('cubes')[0].textContent),
          trailblazes: o(overall.getElementsByClassName('trailblazes')[0].textContent),
          scythes: o(overall.getElementsByClassName('scythes')[0].textContent),
          completes: o(overall.getElementsByClassName('complete')[0].textContent)
        }
      };

      let previous = Utils.ls.get('profile-history-previous');
      _this.result.previous = previous ? JSON.parse(previous) : empty;

      let best = Utils.ls.get('profile-history-best');
      _this.result.best = best ? JSON.parse(best) : empty;
      
      _this.addCharts('days', Utils.date.getLast.sevenDays());

    }, 50);
  };
  
  this.fillTheGaps = function (obj, valueOnly = false) {
    obj.points = obj.points || o();
    obj.cubes = obj.cubes || o();
    obj.trailblazes = obj.trailblazes || o();
    obj.scythes = obj.scythes || o();
    obj.completes = obj.completes || o();

    return obj;
  };

  
  this.updateServer = function (callback) {
    GM_xmlhttpRequest({
      method: 'POST',
      url: 'http://ewstats.feedia.co/update_server_counters' + (DEBUG ? '_dev' : '') + '.php',
      data: 'data=' + encodeURIComponent(Utils.ls.get('profile-history')) +
            '&uid=' + encodeURIComponent(account.account.uid),
      headers:    {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      onload: function (response) {
        if (DEBUG && TEST_SERVER_UPDATE) {
          console.log(response.responseText);
          return;
        }
        if (response.responseText === 'ok') {
          if (callback) {
            callback();
          }
        }
      },
      onerror: function (response) {
        console.error('error: ', response);
      },
      ontimeout: function (response) {
        console.error('timeout: ', response);
      }
    });
  };

  
  this.updateClient = function (callback) {
    let data = [
      'uid=' + account.account.uid,
      'previous=1',
      'best=1',
      'charts=1'
    ].join('&');

    GM_xmlhttpRequest({
      method: 'GET',
      url: 'http://ewstats.feedia.co/update_local_counters' + (DEBUG ? '_dev' : '') + '.php?' + data,
      onload: function (response) {
        if (response && response.responseText) {
          if (DEBUG && TEST_CLIENT_UPDATE) {
            console.log(response.responseText);
            return;
          }
          let data = JSON.parse(response.responseText);
          if (data.result === 'ok') {
            Utils.ls.set('profile-history-previous', JSON.stringify({
              day: _this.fillTheGaps(data.previous.day || {}),
              week: _this.fillTheGaps(data.previous.week || {}),
              month: _this.fillTheGaps(data.previous.month || {})
            }));
            Utils.ls.set('profile-history-best', JSON.stringify({
              day: _this.fillTheGaps(data.best.day || {}),
              week: _this.fillTheGaps(data.best.week || {}),
              month: _this.fillTheGaps(data.best.month || {})
            }));
            Utils.ls.set('profile-history-charts', JSON.stringify({
              days: data.charts.days,
              weeks: data.charts.weeks,
              months: data.charts.months
            }));
            _this.updateDataInProfile();

            Utils.ls.remove('profile-history');
            
            if (callback) {
              callback();
            }
          }
          else {
            console.error(data.msg);
          }
        }
        else {
          console.error('Something went wrong while updating the data from the server');
        }
      },
      onerror: function (response) {
        console.error('error: ', response);
      },
      ontimeout: function (response) {
        console.error('timeout: ', response);
      }
    });
  };
  
  
  (function update() {
    let propName = 'profile-history-last-update-date';
    let lastUpdateDate = Utils.ls.get(propName);
    if (!lastUpdateDate || lastUpdateDate != Utils.date.calculateHqDate() || DEBUG) {
      _this.updateServer(function () {
        _this.updateClient(function () {
          if (DEBUG) {
            Utils.ls.set(propName, 1);
          }
          else {
            Utils.ls.set(propName, Utils.date.calculateHqDate());
          }
        });
      });
    }
  })();
  
  var updateVotesTimer;

  // three last events triggered in AccuChart()
  $(document).on('votes-updated cube-admin-reaped cube-reaped cube-trailblazed', function () {
    clearTimeout(updateVotesTimer);
    updateVotesTimer = setTimeout(_this.updateLocalStorage, 15000);
  });
  
  // When a user clicks on his profile first, then change tab to best or previous,
  // then opens another profile, the color of best or previous stood for current tab,
  // so we have to click the current tab first to change the colors and rows.
  // However, when the user clicks on some other profile first, then trying to click
  // on the current tab was giving an error, so we have to check first, the user
  // profile has been loaded
  this.mainProfileLoaded = false;

  $(document)
    .on('click', '#profileButton', function () {
      _this.collectingInProgress = true;
      _this.updateDataInProfile();
      _this.mainProfileLoaded = true;
    })
    .on('stats-collected', function () {
      _this.collectingInProgress = false;
    });

  $('.profileNavButtonGroup').on('click', '.profileNavButton', function (event, dontChangeTheData) {
    var
      $this = $(this),
      data = $this.data();

    $this
      .parent()
        .find('.profileNavButton')
          .removeClass('selected')
        .end()
      .end()
      .addClass('selected');

    _this.dontChangeTheData = !!dontChangeTheData;
    _this.changeTab(data.type);
  });

  $('.ewsProfileHistoryButtonGroup').on('click', '.ewsProfileHistoryButton', function (event) {
    var
      $this = $(this),
      data = $this.data();

    $this
      .parent()
        .find('.ewsProfileHistoryButton')
          .removeClass('selected')
        .end()
      .end()
      .addClass('selected');

    _this.changeChartRange(data.timeRange);
  });

  this.dontChangeTheData = false;
 
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.target.classList.contains('attention-display')) {
        let intv = setInterval(function () {
          if (!Utils.gid('profUsername').textContent.length) {
            return;
          }
          
          clearInterval(intv);
          // we have to turn off observing for a bit, to make the changes without
          // triggering the obverver and falling into an endless loop...
          observer.disconnect();
          if (document.getElementById('profUsername').textContent === account.account.username) {
            Utils.gid('profileContainer').classList.add('own-profile');
          }
          else {
            if (_this.mainProfileLoaded) {
              $('.profileNavButton:first').trigger('click', [true]);
            }
            Utils.gid('profileContainer').classList.remove('own-profile');
          }
          // ... end then turn it on again
          observer.observe(Utils.gid('profileContainer'), {attributes: true});
        }, 50);
      }
    });
  });
 
  observer.observe(Utils.gid('profileContainer'), {attributes: true});
}
// end: TRACKER



Utils.addCSSFile('https://chrisraven.github.io/EWStats/EWStats.css?v=10');
Utils.addCSSFile('https://chrisraven.github.io/EWStats/jquery-jvectormap-2.0.3.css');
Utils.addCSSFile('https://chrisraven.github.io/EWStats/spectrum.css?v=3');



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
        
        if (this.readyState == 4 && this.status == 200 &&
            url.indexOf('/stats') !== -1 &&
            method.toLowerCase() === 'get') {
          $(document).trigger('stats-collected');
        }
      }, false);
      open.call(this, method, url, async, user, pass);
    };
  }) (XMLHttpRequest.prototype.open);
`);


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
new Tracker(); // jshint ignore:line



if (account.roles.scout) {
  db = new Database();
  highlight = new CustomHighlight();
  if (localStorage.getItem('ews-highlight-data')) { // migrating from localStorage to IndexedDB
    let ls = JSON.parse(localStorage.getItem('ews-highlight-data'));
    for (let cellId in ls) {
      if (ls.hasOwnProperty(cellId)) {
        db.put({cellId: cellId, cellIds: ls[cellId], timestamp: Date.now()});
      }
    }
    localStorage.removeItem('ews-highlight-data');
  }
}

if (account.roles.scythe || account.roles.mystic) {
  history = new SCHistory();
  history.removeOldEntries();
}



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

    
if (DEBUG) {

  $('body').append(`
    <button id="test-button" style="position: absolute; left: 100px; top: 10px; z-index: 101;">Test</button>
  `);
  
  
  let testFunction = function () {
  GM_xmlhttpRequest({
        method: 'POST',
        url: 'http://ewstats.feedia.co/update_server_counters' + (DEBUG ? '_dev' : '') + '.php',
        data: 'data=' + encodeURIComponent(Utils.ls.get('profile-history')) +
              '&uid=' + encodeURIComponent(account.account.uid),
        headers:    {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        onload: function (response) {console.log(response.responseText);return;
          /*if (response.responseText === 'ok') {
            if (callback) {
              callback();
            }
          }*/
        },
        onerror: function (response) {
          console.error('error: ', response);
        },
        ontimeout: function (response) {
          console.error('timeout: ', response);
        }
      });
  };

  $('#test-button').click(function () {
    testFunction();
  });

} // end: DEBUG



} // end: main()



})(); // end: wrapper
