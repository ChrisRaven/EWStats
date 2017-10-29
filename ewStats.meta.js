// ==UserScript==
// @name         EyeWire Statistics
// @namespace    http://tampermonkey.net/
// @version      1.4.5
// @description  Shows daily, weekly and monthly statistics for EyeWire. Displays accuracy for the last 60 played/scythed cubes
// @author       Krzysztof Kruk
// @match        https://*.eyewire.org/
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
