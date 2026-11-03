/*!
 * LiteDatePicker v1.4 - 轻量级原生 JS 日期选择器（单文件，无依赖）
 * 年：每行3个，每页10个，箭头翻页
 * 月：每行3个，一页12个
 * 日：每行6个，一页显示整月
 *
 * v1.4 新增：
 *  · 可选日期范围：new LiteDatePicker(el, { minDate: '2026-01-01', maxDate: '2026-12-31' })
 *      或 picker.setMinDate(v) / picker.setMaxDate(v)（传 null / '' 解除）
 *      范围外的年/月/日格子渲染为 disabled 点不动，键盘导航自动跳过
 *      语义与原生 <input type="date"> 的 min/max 一致：只限制「还能选什么」，
 *      不改写已有日期、不触发 change；当前值落在界外时根节点带 .ldp-out-of-range，
 *      可用 picker.isInRange() 自查；之后 setDate / 点格子 / 方向键都会把日期夹回范围内
 *      getMinDate() / getMaxDate() 读回 'YYYY-MM-DD' 或 null；两个界写反了会自动交换；
 *      农历模式下按朔望月换算成公历再判定
 *  · 浮层宽度改为按内容实测（scrollWidth），农历「初一/廿九」不再撑出横向滚动条
 *
 * v1.3：
 *  · 键盘导航：浮层展开时 ←/→/↑/↓ 在选项间移动，Home/End 跳到首末，
 *    PageUp/PageDown 年份翻页，Enter/空格 选中（按钮原生行为），Esc 关闭
 *  · 农历模式：new LiteDatePicker(el, { lunar: true }) 或 picker.setLunar(true)
 *      年 → 2026 年；月 → 一月…十二月（自动带出闰月）；日 → 初一…廿九/三十
 *      内部仍以公历日期为准，getValue()/onChange 依旧输出 YYYY-MM-DD
 *  · 农历换算优先复用宿主的 lunar.js（与老黄历页面历注完全一致）；
 *    宿主没有 lunar.js 时启用内置 LunarCal 天文算法（东八区日界），组件依旧零依赖可用
 *
 * 扩展：CSS 主题变量、窄屏布局、固定定位浮层、静默同步、公开 close()
 */
(function (global) {
  'use strict';

  /* ---------- 组件样式（自动注入，仅一次） ---------- */
  var CSS = ''
    + '.ldp,.ldp *{box-sizing:border-box}'
    + '.ldp{display:flex;gap:8px;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:var(--ldp-text,#334155);user-select:none;flex-wrap:nowrap}'
    + '.ldp button{font-family:inherit}'
    + '.ldp-unit{position:relative;flex:1;min-width:0}'
    + '.ldp-unit[data-unit="year"]{flex:1.3;min-width:0}'
    + '.ldp-trigger{display:flex;align-items:center;gap:6px;padding:9px 10px;background:var(--ldp-bg,#fff);'
    + 'border:1px solid var(--ldp-border,#e2e8f0);border-radius:10px;cursor:pointer;width:100%;font:inherit;color:inherit;justify-content:space-between;flex-shrink:0;min-width:0;'
    + 'transition:border-color .15s,box-shadow .15s}'
    + '.ldp-trigger:hover{border-color:var(--ldp-accent,#a5b4fc)}'
    + '.ldp-unit.open .ldp-trigger{border-color:var(--ldp-accent,#4f46e5);box-shadow:0 0 0 3px var(--ldp-ring,rgba(79,70,229,.12))}'
    + '.ldp-value{font-variant-numeric:tabular-nums;font-weight:500}'
    + '.ldp-caret{width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;'
    + 'border-top:5px solid var(--ldp-muted,#94a3b8);transition:transform .2s}'
    + '.ldp-unit.open .ldp-caret{transform:rotate(180deg);border-top-color:var(--ldp-accent,#4f46e5)}'
    + '.ldp-panel{position:fixed;z-index:9999;overflow:auto;overscroll-behavior:contain;background:var(--ldp-bg,#fff);'
    + 'border:1px solid var(--ldp-border,#e2e8f0);border-radius:12px;box-shadow:0 12px 32px rgba(30,41,59,.14);'
    + 'padding:10px;display:none;animation:ldpIn .16s ease;min-width:220px;white-space:nowrap}'
    + '.ldp-unit[data-unit="year"] .ldp-panel{min-width:220px;left:0;right:auto}'
    + '.ldp-unit[data-unit="month"] .ldp-panel{min-width:220px}'
    + '.ldp-unit[data-unit="day"] .ldp-panel{left:auto;right:0;min-width:260px}'
    + '.ldp-unit.open .ldp-panel{display:block}'
    + '@keyframes ldpIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}'
    + '.ldp-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding:0 2px}'
    + '.ldp-range{font-size:12px;color:var(--ldp-muted,#64748b);font-weight:600;font-variant-numeric:tabular-nums}'
    + '.ldp-tag{display:inline-block;margin-left:6px;padding:0 5px;border:1px solid var(--ldp-accent,#4f46e5);'
    + 'border-radius:6px;color:var(--ldp-accent,#4f46e5);font-size:10px;font-style:normal;font-weight:600;vertical-align:1px}'
    + '.ldp-arrow{width:26px;height:26px;border:none;background:var(--ldp-cell-bg,#f1f5f9);border-radius:7px;cursor:pointer;'
    + 'color:var(--ldp-text,#475569);font-size:13px;line-height:1;display:flex;align-items:center;justify-content:center;transition:all .15s}'
    + '.ldp-arrow:hover:not(:disabled){background:var(--ldp-accent,#4f46e5);color:#fff}'
    + '.ldp-arrow:disabled{opacity:.35;cursor:not-allowed}'
    + '.ldp-grid{display:grid;gap:6px}'
    + '.ldp-grid.cols-3{grid-template-columns:repeat(3,1fr)}'
    + '.ldp-grid.cols-6{grid-template-columns:repeat(6,1fr)}'
    + '.ldp-cell{border:none;background:var(--ldp-cell-bg,#f8fafc);border-radius:8px;padding:8px 0;cursor:pointer;'
    + 'font-size:13px;color:var(--ldp-text,#334155);text-align:center;font-variant-numeric:tabular-nums;transition:all .12s;white-space:nowrap}'
    + '.ldp-grid.cols-3 .ldp-cell{min-width:64px}'
    + '.ldp-grid.cols-6 .ldp-cell{min-width:34px;padding:7px 0}'
    + '.ldp-cell:hover{background:var(--ldp-tint,#eef2ff);color:var(--ldp-accent,#4f46e5)}'
    + '.ldp-cell.active{background:var(--ldp-accent,#4f46e5);color:#fff;font-weight:600;box-shadow:0 3px 8px var(--ldp-ring,rgba(79,70,229,.35))}'
    + '.ldp-cell:disabled{opacity:.35;cursor:not-allowed;background:transparent;color:var(--ldp-muted,#94a3b8);box-shadow:none}'
    + '.ldp-cell:disabled:hover{background:transparent;color:var(--ldp-muted,#94a3b8)}'
    + '.ldp-cell.leap{background:var(--ldp-tint,#eef2ff);color:var(--ldp-accent,#4f46e5)}'
    + '.ldp-cell.leap.active{background:var(--ldp-accent,#4f46e5);color:#fff}'
    + '.ldp-cell.leap:disabled{background:transparent;color:var(--ldp-muted,#94a3b8)}'
    + '.ldp.ldp-out-of-range .ldp-trigger{border-color:var(--ldp-invalid,#e11d48)}'
    + '.ldp.ldp-out-of-range .ldp-value{color:var(--ldp-invalid,#e11d48)}'
    + '.ldp button:focus-visible{outline:2px solid var(--ldp-accent,#4f46e5);outline-offset:2px}'
    + '.ldp.lunar .ldp-grid.cols-3 .ldp-cell{min-width:60px}'
    + '.ldp.lunar .ldp-grid.cols-6 .ldp-cell{min-width:44px;padding:7px 0;font-size:12px}'
    + '.ldp.lunar .ldp-trigger .ldp-value{font-variant-numeric:normal}'
    + '@media(max-width:480px){.ldp-trigger{padding:9px 10px;gap:4px}.ldp.lunar .ldp-grid.cols-6 .ldp-cell{min-width:38px}}'
    + '@media(prefers-reduced-motion:reduce){.ldp-panel{animation:none}.ldp *{transition:none}}';

  function injectStyle() {
    if (document.getElementById('ldp-style')) return;
    var s = document.createElement('style');
    s.id = 'ldp-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  // 年份补足 4 位：主程序按字符串比较 0000-01-01 / 9999-12-31，'0-06-01' 这类值会判错
  function pad4(y) { var s = String(Math.abs(y)); while (s.length < 4) s = '0' + s; return s; }
  function fmtDate(y, m, d) { return pad4(y) + '-' + pad(m) + '-' + pad(d); }
  function isLeapYear(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
  // 前推格里历（proleptic Gregorian），与主程序 daysBetween 的历法约定一致；
  // 不用 new Date(y, m, 0)，因为 JS 会把 0-99 年映射到 1900-1999。
  function daysInMonth(y, m) {
    var table = [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return table[m - 1];
  }
  function cmpDate(y1, m1, d1, y2, m2, d2) {
    return (y1 - y2) || (m1 - m2) || (d1 - d2);
  }

  function parseDate(input) {
    if (input instanceof Date && !isNaN(input)) {
      return { year: input.getFullYear(), month: input.getMonth() + 1, day: input.getDate() };
    }
    // 也接受 { year, month, day } 纯对象（农历换算的结果直接回灌）
    if (input && typeof input === 'object' && input.year != null) {
      return { year: +input.year, month: +input.month || 1, day: +input.day || 1 };
    }
    if (typeof input === 'string') {
      var m = input.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
      if (m) return { year: +m[1], month: +m[2], day: +m[3] };
    }
    var n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() + 1, day: n.getDate() };
  }

  // minDate / maxDate -> { year, month, day }；null / 空串表示该侧不限制
  function toBound(input) {
    if (input == null || input === '') return null;
    var d = parseDate(input);
    return { year: d.year, month: d.month, day: d.day };
  }
  // 下限晚于上限时交换，避免出现"什么都选不了"的死区
  function normalizeBounds(picker) {
    var lo = picker._lo, hi = picker._hi;
    if (lo && hi && cmpDate(lo.year, lo.month, lo.day, hi.year, hi.month, hi.day) > 0) {
      picker._lo = hi;
      picker._hi = lo;
    }
  }

  /* ============================================================
   * 农历（阴阳合历）换算：内置天文算法，无外部依赖
   *  · 日界：东八区子夜（中国历法以北京时间定日）
   *  · 朔（每月初一）：Meeus《Astronomical Algorithms》第 49 章新月公式（14 项行星修正 + 25 项主修正）
   *  · 中气：太阳视黄经为 30° 整数倍的时刻（第 25 章）
   *  · 置闰：两个冬至之间若含 13 个朔望月，取其中首个不含中气者为闰月
   *  · TT→UT 采用 Espenak & Meeus 的 ΔT 多项式
   * ============================================================ */
  var LunarCal = (function () {
    var TZ = 8 / 24;                 // 东八区偏移（天）
    var DEG = Math.PI / 180;
    var MIN_YEAR = 1;
    var MAX_YEAR = 9999;
    var CN = ['日', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

    var nmCache = Object.create(null);     // 朔望月序号 k -> 新月 JD(UT)
    var wsCache = Object.create(null);     // 公历年 -> 冬至日序号
    var spanCache = Object.create(null);   // 农历年 -> 两个冬至之间的朔日表
    var yearCache = Object.create(null);   // 农历年 -> 月份表

    function size(o) { var n = 0, k; for (k in o) { n++; } return n; }

    /* —— 儒略日与日序号 —— */
    function dateToJD(y, m, d) {
      if (m <= 2) { y -= 1; m += 12; }
      var a = Math.floor(y / 100), b = 2 - a + Math.floor(a / 4);
      return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5;
    }
    function jdToDate(jd) {
      var z = Math.floor(jd + 0.5);
      var alpha = Math.floor((z - 1867216.25) / 36524.25);
      var a = z + 1 + alpha - Math.floor(alpha / 4);
      var b = a + 1524, c = Math.floor((b - 122.1) / 365.25), e = Math.floor(365.25 * c), g = Math.floor((b - e) / 30.6001);
      var day = b - e - Math.floor(30.6001 * g);
      var month = g < 14 ? g - 1 : g - 13;
      return { year: month > 2 ? c - 4716 : c - 4715, month: month, day: day };
    }
    function dnOf(y, m, d) { return Math.round(dateToJD(y, m, d) + 0.5); }   // 日序号（整数天）
    function dateOfDn(dn) { return jdToDate(dn - 0.5); }
    function jdOfDn(dn) { return dn - 0.5; }                                  // 该日 0h UT
    function dnAt(jd) { return Math.floor(jd + TZ + 0.5); }                   // 东八区日界

    /* —— ΔT（TT - UT，秒）：Espenak & Meeus 多项式 —— */
    function deltaT(jd) {
      var y = 2000 + (jd - 2451545.0) / 365.2425, t, u;
      if (y < -500 || y >= 2150) { u = (y - 1820) / 100; return -20 + 32 * u * u; }
      if (y < 500) {
        u = y / 100;
        return 10583.6 - 1014.41 * u + 33.78311 * u * u - 5.952053 * Math.pow(u, 3)
          - 0.1798452 * Math.pow(u, 4) + 0.022174192 * Math.pow(u, 5) + 0.0090316521 * Math.pow(u, 6);
      }
      if (y < 1600) {
        u = (y - 1000) / 100;
        return 1574.2 - 556.01 * u + 71.23472 * u * u + 0.319781 * Math.pow(u, 3)
          - 0.8503463 * Math.pow(u, 4) - 0.005050998 * Math.pow(u, 5) + 0.0083572073 * Math.pow(u, 6);
      }
      if (y < 1700) { t = y - 1600; return 120 - 0.9808 * t - 0.01532 * t * t + t * t * t / 7129; }
      if (y < 1800) { t = y - 1700; return 8.83 + 0.1603 * t - 0.0059285 * t * t + 0.00013336 * Math.pow(t, 3) - Math.pow(t, 4) / 1174000; }
      if (y < 1860) {
        t = y - 1800;
        return 13.72 - 0.332447 * t + 0.0068612 * t * t + 0.0041116 * Math.pow(t, 3) - 0.00037436 * Math.pow(t, 4)
          + 0.0000121272 * Math.pow(t, 5) - 0.0000001699 * Math.pow(t, 6) + 0.000000000875 * Math.pow(t, 7);
      }
      if (y < 1900) { t = y - 1860; return 7.62 + 0.5737 * t - 0.251754 * t * t + 0.01680668 * Math.pow(t, 3) - 0.0004473624 * Math.pow(t, 4) + Math.pow(t, 5) / 233174; }
      if (y < 1920) { t = y - 1900; return -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * Math.pow(t, 3) - 0.000197 * Math.pow(t, 4); }
      if (y < 1941) { t = y - 1920; return 21.20 + 0.84493 * t - 0.076100 * t * t + 0.0020936 * Math.pow(t, 3); }
      if (y < 1961) { t = y - 1950; return 29.07 + 0.407 * t - t * t / 233 + Math.pow(t, 3) / 2547; }
      if (y < 1986) { t = y - 1975; return 45.45 + 1.067 * t - t * t / 260 - Math.pow(t, 3) / 718; }
      if (y < 2005) {
        t = y - 2000;
        return 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * Math.pow(t, 3) + 0.000651814 * Math.pow(t, 4) + 0.00002373599 * Math.pow(t, 5);
      }
      if (y < 2050) { t = y - 2000; return 62.92 + 0.32217 * t + 0.005589 * t * t; }
      return -20 + 32 * Math.pow((y - 1820) / 100, 2) - 0.5628 * (2150 - y);
    }

    /* —— 太阳视黄经（度） —— */
    function sunLongitude(jd) {
      var t = (jd - 2451545.0) / 36525;
      var l0 = 280.46646 + 36000.76983 * t + 0.0003032 * t * t;
      var m = (357.52911 + 35999.05029 * t - 0.0001537 * t * t) * DEG;
      var c = (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(m)
        + (0.019993 - 0.000101 * t) * Math.sin(2 * m)
        + 0.000289 * Math.sin(3 * m);
      var om = (125.04 - 1934.136 * t) * DEG;
      var lon = l0 + c - 0.00569 - 0.00478 * Math.sin(om);
      return ((lon % 360) + 360) % 360;
    }

    // 求太阳黄经等于 target 的时刻（返回 UT 儒略日）
    function sunTermJD(target, seedJD) {
      var jd = seedJD, i, diff;
      for (i = 0; i < 25; i++) {
        diff = (((target - sunLongitude(jd)) % 360) + 540) % 360 - 180;
        if (Math.abs(diff) < 1e-8) break;
        jd += diff / 360 * 365.2422;
      }
      return jd - deltaT(jd) / 86400;
    }

    // 冬至（黄经 270°）所在日序号，gy 为公历年
    function winterSolsticeDn(gy) {
      var hit = wsCache[gy];
      if (hit !== undefined) return hit;
      var dn = dnAt(sunTermJD(270, jdOfDn(dnOf(gy, 12, 21)) + 0.5));
      if (size(wsCache) > 1200) { wsCache = Object.create(null); }
      wsCache[gy] = dn;
      return dn;
    }

    // 该日及其之后第一个中气（黄经为 30° 整数倍）的日序号
    function majorTermDnOnOrAfter(dn) {
      var jd0 = jdOfDn(dn) + 0.5;
      var base = Math.floor(sunLongitude(jd0) / 30) * 30;
      var best = Infinity, i, cand;
      for (i = -1; i <= 1; i++) {
        cand = dnAt(sunTermJD(((base + i * 30) % 360 + 360) % 360, jd0 + i * 30.4));
        if (cand >= dn && cand < best) { best = cand; }
      }
      return best;
    }
    function hasMajorTerm(startDn, days) { return majorTermDnOnOrAfter(startDn) < startDn + days; }

    /* —— 新月（朔） —— */
    function newMoonJD(k) {
      var hit = nmCache[k];
      if (hit !== undefined) return hit;
      var t = k / 1236.85, t2 = t * t, t3 = t2 * t, t4 = t3 * t;
      var jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * t2 - 0.000000150 * t3 + 0.00000000073 * t4;
      var e = 1 - 0.002516 * t - 0.0000074 * t2, e2 = e * e;
      var M = (2.5534 + 29.10535670 * k - 0.0000014 * t2 - 0.00000011 * t3) * DEG;
      var Mp = (201.5643 + 385.81693528 * k + 0.0107582 * t2 + 0.00001238 * t3 - 0.000000058 * t4) * DEG;
      var F = (160.7108 + 390.67050284 * k - 0.0016118 * t2 - 0.00000227 * t3 + 0.000000011 * t4) * DEG;
      var Om = (124.7746 - 1.56375588 * k + 0.0020672 * t2 + 0.00000215 * t3) * DEG;
      var A = [
        (299.77 + 0.107408 * k - 0.009173 * t2) * DEG,
        (251.88 + 0.016321 * k) * DEG,
        (251.83 + 26.651886 * k) * DEG,
        (349.42 + 36.412478 * k) * DEG,
        (84.66 + 18.206239 * k) * DEG,
        (141.74 + 53.303771 * k) * DEG,
        (207.14 + 2.453732 * k) * DEG,
        (154.84 + 7.306860 * k) * DEG,
        (34.52 + 27.261239 * k) * DEG,
        (207.19 + 0.121824 * k) * DEG,
        (291.34 + 1.844379 * k) * DEG,
        (161.72 + 24.198154 * k) * DEG,
        (239.56 + 25.513099 * k) * DEG,
        (331.55 + 3.592518 * k) * DEG
      ];
      var AC = [0.000325, 0.000165, 0.000164, 0.000126, 0.000110, 0.000062, 0.000060,
        0.000056, 0.000047, 0.000042, 0.000040, 0.000037, 0.000035, 0.000023];
      var s1 = 0, i;
      for (i = 0; i < 14; i++) { s1 += AC[i] * Math.sin(A[i]); }
      var s2 = -0.40720 * Math.sin(Mp)
        + 0.17241 * e * Math.sin(M)
        + 0.01608 * Math.sin(2 * Mp)
        + 0.01039 * Math.sin(2 * F)
        + 0.00739 * e * Math.sin(Mp - M)
        - 0.00514 * e * Math.sin(Mp + M)
        + 0.00208 * e2 * Math.sin(2 * M)
        - 0.00111 * Math.sin(Mp - 2 * F)
        - 0.00057 * Math.sin(Mp + 2 * F)
        + 0.00056 * e * Math.sin(2 * Mp + M)
        - 0.00042 * Math.sin(3 * Mp)
        + 0.00042 * e * Math.sin(M + 2 * F)
        + 0.00038 * e * Math.sin(M - 2 * F)
        - 0.00024 * e * Math.sin(2 * Mp - M)
        - 0.00017 * Math.sin(Om)
        - 0.00007 * Math.sin(Mp + 2 * M)
        + 0.00004 * Math.sin(2 * Mp - 2 * F)
        + 0.00004 * Math.sin(3 * M)
        + 0.00003 * Math.sin(Mp + M - 2 * F)
        + 0.00003 * Math.sin(2 * Mp + 2 * F)
        - 0.00003 * Math.sin(Mp + M + 2 * F)
        + 0.00003 * Math.sin(Mp - M + 2 * F)
        - 0.00002 * Math.sin(Mp - M - 2 * F)
        - 0.00002 * Math.sin(3 * Mp + M)
        + 0.00002 * Math.sin(4 * Mp);
      var jd = jde + s1 + s2 - deltaT(jde) / 86400;
      if (size(nmCache) > 2000) { nmCache = Object.create(null); }
      nmCache[k] = jd;
      return jd;
    }

    function kAt(dn) {
      var d = dateOfDn(dn);
      return Math.round((d.year + (d.month - 0.5) / 12 - 2000) * 12.3685);
    }
    // 返回 k，使 newMoonDn(k) <= dn < newMoonDn(k+1)
    function kOnOrBefore(dn) {
      var k = kAt(dn), guard = 0;
      while (dnAt(newMoonJD(k)) > dn && guard++ < 60) { k--; }
      guard = 0;
      while (dnAt(newMoonJD(k + 1)) <= dn && guard++ < 60) { k++; }
      return k;
    }

    /* —— 两个冬至之间的朔日表 + 闰月位置 —— */
    function span(ly) {
      var hit = spanCache[ly];
      if (hit) { return hit; }
      var k0 = kOnOrBefore(winterSolsticeDn(ly - 1));
      var k1 = kOnOrBefore(winterSolsticeDn(ly));
      var n = k1 - k0, starts = [], i;
      for (i = 0; i <= n; i++) { starts.push(dnAt(newMoonJD(k0 + i))); }
      var leap = -1;
      if (n >= 13) {
        for (i = 1; i < n; i++) {
          if (!hasMajorTerm(starts[i], starts[i + 1] - starts[i])) { leap = i; break; }
        }
        if (leap < 0) { leap = 1; }
      }
      var res = { starts: starts, leap: leap, count: n };
      if (size(spanCache) > 400) { spanCache = Object.create(null); }
      spanCache[ly] = res;
      return res;
    }

    function leapMonthOf(months) {
      for (var i = 0; i < months.length; i++) { if (months[i].isLeap) { return months[i].m; } }
      return 0;
    }

    /* —— 农历年月份表：{ months:[{m,isLeap,start,days}], leap, start, days } —— */
    function yearMonths(ly) {
      var hit = yearCache[ly];
      if (hit) { return hit; }
      var sp = span(ly), list = [], num = 1, i;
      var first = 2;
      if (sp.leap === 1 || sp.leap === 2) { first = 3; }   // 闰十一月/闰十二月归上一年
      for (i = first; i < sp.count; i++) {
        var isLeap = (i === sp.leap);
        list.push({ m: isLeap ? num - 1 : num, isLeap: isLeap, start: sp.starts[i], days: sp.starts[i + 1] - sp.starts[i] });
        if (!isLeap) { num++; }
      }
      var sp2 = span(ly + 1), idx = 1;
      list.push({ m: 11, isLeap: false, start: sp2.starts[0], days: sp2.starts[1] - sp2.starts[0] });
      if (sp2.leap === 1) {
        list.push({ m: 11, isLeap: true, start: sp2.starts[1], days: sp2.starts[2] - sp2.starts[1] });
        idx = 2;
      }
      list.push({ m: 12, isLeap: false, start: sp2.starts[idx], days: sp2.starts[idx + 1] - sp2.starts[idx] });
      var out = { months: list, leap: leapMonthOf(list), start: list[0].start, days: 0 };
      for (i = 0; i < list.length; i++) { out.days += list[i].days; }
      if (size(yearCache) > 400) { yearCache = Object.create(null); }
      yearCache[ly] = out;
      return out;
    }

    function findMonth(months, m, isLeap) {
      var i;
      for (i = 0; i < months.length; i++) {
        if (months[i].m === m && !!months[i].isLeap === !!isLeap) { return months[i]; }
      }
      return null;
    }

    /* ---------- 对外接口 ---------- */
    function supported(y) { return y >= MIN_YEAR && y <= MAX_YEAR; }

    // 公历 -> 农历；超出支持范围返回 null
    function fromSolar(y, m, d) {
      if (!supported(y)) { return null; }
      var dn = dnOf(y, m, d);
      var gy = y, info = yearMonths(gy), i;
      if (dn < info.start) {
        if (!supported(gy - 1)) { return null; }
        gy = gy - 1;
        info = yearMonths(gy);
      }
      for (i = info.months.length - 1; i >= 0; i--) {
        if (dn >= info.months[i].start) {
          return {
            year: gy,
            month: info.months[i].m,
            isLeap: !!info.months[i].isLeap,
            day: dn - info.months[i].start + 1,
            monthDays: info.months[i].days,
            yearDays: info.days,
            leapMonth: info.leap
          };
        }
      }
      return null;
    }

    // 农历 -> 公历；非法组合（如小月三十、不存在的闰月）返回 null
    function toSolar(ly, lm, ld, isLeap) {
      if (!supported(ly)) { return null; }
      var target = findMonth(yearMonths(ly).months, lm, isLeap);
      if (!target || !(ld >= 1) || ld > target.days) { return null; }
      return dateOfDn(target.start + ld - 1);
    }

    function monthList(ly) { return supported(ly) ? yearMonths(ly).months : null; }
    function monthDays(ly, lm, isLeap) {
      if (!supported(ly)) { return 0; }
      var t = findMonth(yearMonths(ly).months, lm, isLeap);
      return t ? t.days : 0;
    }
    function leapMonth(ly) { return supported(ly) ? yearMonths(ly).leap : 0; }
    function yearDays(ly) { return supported(ly) ? yearMonths(ly).days : 0; }

    function cnMonth(m) { return m < 10 ? CN[m] : m === 10 ? '十' : '十' + CN[m - 10]; }
    function cnDay(d) {
      if (d <= 10) { return '初' + CN[d]; }
      if (d < 20) { return '十' + CN[d - 10]; }
      if (d === 20) { return '二十'; }
      if (d < 30) { return '廿' + CN[d - 20]; }
      return '三十';
    }
    function cnMonthLabel(m, isLeap) { return (isLeap ? '闰' : '') + cnMonth(m) + '月'; }

    return {
      MIN_YEAR: MIN_YEAR,
      MAX_YEAR: MAX_YEAR,
      supported: supported,
      fromSolar: fromSolar,
      toSolar: toSolar,
      months: monthList,
      monthDays: monthDays,
      leapMonth: leapMonth,
      yearDays: yearDays,
      cnMonth: cnMonth,
      cnDay: cnDay,
      cnMonthLabel: cnMonthLabel,
      // 内部实现（供校验/调试）
      _internals: {
        dateToJD: dateToJD, jdToDate: jdToDate, dnOf: dnOf, dateOfDn: dateOfDn, dnAt: dnAt,
        sunLongitude: sunLongitude, sunTermJD: sunTermJD, newMoonJD: newMoonJD,
        winterSolsticeDn: winterSolsticeDn, majorTermDnOnOrAfter: majorTermDnOnOrAfter,
        span: span, yearMonths: yearMonths, deltaT: deltaT
      }
    };
  })();

  /* ============================================================
   * 历法提供者
   * 老黄历主程序自带 lunar.js（页面历注也由它计算）。宿主已加载时直接复用，
   * 保证选择器换算出的农历与页面上印的历注逐日一致（含 1645 年前的平气平朔古历）；
   * 未加载 lunar.js 时退回内置 LunarCal 天文算法，组件仍可独立工作。
   * ============================================================ */
  var Lunar = (function () {
    var engine = 'auto';                 // 'auto' | 'host' | 'builtin'

    function host() {
      if (engine === 'builtin') return null;
      var g = global;
      return (g && g.Solar && g.Lunar && g.LunarYear && g.LunarMonth) ? g : null;
    }
    function sign(m, isLeap) { return isLeap ? -m : m; }

    // lunar.js 每次 LunarYear.fromYear() 都要重算一整年的节气与朔（约 1ms），
    // 翻页时会被反复调用，这里按农历年缓存结果（纯函数，不会失效）。
    var yearInfo = Object.create(null);
    function yearOf(h, ly) {
      var hit = yearInfo[ly];
      if (hit) return hit;
      var n = 0, k;
      for (k in yearInfo) { n++; }
      if (n > 300) { yearInfo = Object.create(null); }
      var year = h.LunarYear.fromYear(ly);
      var ms = year.getMonths(), months = [], i, mm;
      for (i = 0; i < ms.length; i++) {
        mm = ms[i];
        if (mm.getYear() !== ly) continue;
        months.push({
          m: Math.abs(mm.getMonth()),
          isLeap: !!mm.isLeap(),
          days: mm.getDayCount(),
          start: Math.round(mm.getFirstJulianDay())
        });
      }
      var info = { leap: year.getLeapMonth(), days: year.getDayCount(), months: months };
      yearInfo[ly] = info;
      return info;
    }
    function pick(info, lm, isLeap) {
      for (var i = 0; i < info.months.length; i++) {
        if (info.months[i].m === lm && !!info.months[i].isLeap === !!isLeap) return info.months[i];
      }
      return null;
    }

    var api = {
      MIN_YEAR: 1,
      MAX_YEAR: 9999,
      // 强制指定实现：'auto'（默认，有 lunar.js 就用）| 'host' | 'builtin'
      setEngine: function (name) { engine = name || 'auto'; return api; },
      currentEngine: function () { return host() ? 'lunar.js' : 'builtin'; },
      supported: function (y) { return y >= api.MIN_YEAR && y <= api.MAX_YEAR; },
      cnMonth: LunarCal.cnMonth,
      cnDay: LunarCal.cnDay,
      cnMonthLabel: LunarCal.cnMonthLabel,

      fromSolar: function (y, m, d) {
        if (!api.supported(y)) return null;
        var h = host();
        if (!h) return LunarCal.fromSolar(y, m, d);
        try {
          var lun = h.Solar.fromYmd(y, m, d).getLunar();
          var signed = lun.getMonth(), isLeap = signed < 0, lm = Math.abs(signed), ly = lun.getYear();
          var info = yearOf(h, ly), mo = pick(info, lm, isLeap);
          return {
            year: ly,
            month: lm,
            isLeap: isLeap,
            day: lun.getDay(),
            monthDays: mo ? mo.days : h.LunarMonth.fromYm(ly, sign(lm, isLeap)).getDayCount(),
            leapMonth: info.leap,
            yearDays: info.days
          };
        } catch (e) {
          // lunar.js 拒绝的日期（如 1582-10-05~14 格里历改革缺口）退回内置算法
          return LunarCal.fromSolar(y, m, d);
        }
      },

      toSolar: function (ly, lm, ld, isLeap) {
        if (!api.supported(ly)) return null;
        var h = host();
        if (!h) return LunarCal.toSolar(ly, lm, ld, isLeap);
        try {
          var sol = h.Lunar.fromYmd(ly, sign(lm, isLeap), ld).getSolar();
          return { year: sol.getYear(), month: sol.getMonth(), day: sol.getDay() };
        } catch (e) {
          return null;   // 小月三十、不存在的闰月等非法组合
        }
      },

      months: function (ly) {
        if (!api.supported(ly)) return null;
        var h = host();
        if (!h) return LunarCal.months(ly);
        try {
          var info = yearOf(h, ly);
          return info.months.length ? info.months : null;
        } catch (e) {
          return LunarCal.months(ly);
        }
      },

      monthDays: function (ly, lm, isLeap) {
        if (!api.supported(ly)) return 0;
        var h = host();
        if (!h) return LunarCal.monthDays(ly, lm, isLeap);
        try {
          var mo = pick(yearOf(h, ly), lm, isLeap);
          return mo ? mo.days : 0;
        } catch (e) { return 0; }
      },

      leapMonth: function (ly) {
        if (!api.supported(ly)) return 0;
        var h = host();
        if (!h) return LunarCal.leapMonth(ly);
        try { return yearOf(h, ly).leap; } catch (e) { return 0; }
      },

      yearDays: function (ly) {
        if (!api.supported(ly)) return 0;
        var h = host();
        if (!h) return LunarCal.yearDays(ly);
        try { return yearOf(h, ly).days; } catch (e) { return 0; }
      }
    };
    return api;
  })();

  /* ---------- 构造函数 ---------- */
  function LiteDatePicker(el, options) {
    if (!(this instanceof LiteDatePicker)) return new LiteDatePicker(el, options);
    injectStyle();

    this.el = typeof el === 'string' ? document.querySelector(el) : el;
    if (!this.el) throw new Error('LiteDatePicker: container element not found');

    var opts = options || {};
    this.minYear = opts.minYear == null ? 1950 : Number(opts.minYear);
    this.maxYear = opts.maxYear == null ? 2050 : Number(opts.maxYear);
    if (!Number.isInteger(this.minYear) || !Number.isInteger(this.maxYear) || this.minYear > this.maxYear) {
      throw new Error('LiteDatePicker: invalid year range');
    }
    this.yearsPerPage = 10;               // 每页 10 个年份
    this.lunar = !!opts.lunar;            // 农历显示模式
    this._lo = null;                      // 可选日期下限（含），{year,month,day}
    this._hi = null;                      // 可选日期上限（含）
    this._listeners = { change: [] };
    if (typeof opts.onChange === 'function') this._listeners.change.push(opts.onChange);

    // 日期级可选范围：minDate / maxDate（Date、'YYYY-MM-DD' 或 null 表示不限）
    this._lo = toBound(opts.minDate);
    this._hi = toBound(opts.maxDate);
    normalizeBounds(this);

    var d = parseDate(opts.date);
    this.year = d.year;
    this.month = d.month;
    this.day = d.day;
    this._clampToRange();
    this._clampDay();

    // 年份翻页起点：让当前年所在页对齐
    this.yearPageStart = this._pageOf(this.year);

    this._build();
    this._bindGlobal();
    this._renderAll();
  }

  var P = LiteDatePicker.prototype;

  /* ---------- DOM 构建 ---------- */
  P._build = function () {
    var root = document.createElement('div');
    root.className = 'ldp';
    root.innerHTML =
      unitHTML('year', '年') + unitHTML('month', '月') + unitHTML('day', '日');
    this.el.appendChild(root);
    this.root = root;

    this.units = {
      year:  root.querySelector('[data-unit="year"]'),
      month: root.querySelector('[data-unit="month"]'),
      day:   root.querySelector('[data-unit="day"]')
    };

    var self = this;

    // 触发器：点击展开/收起
    root.addEventListener('click', function (e) {
      var trigger = e.target.closest('.ldp-trigger');
      if (trigger) {
        var unit = trigger.parentNode;
        var wasOpen = unit.classList.contains('open');
        self._closeAll();
        if (!wasOpen) {
          unit.classList.add('open');
          trigger.setAttribute('aria-expanded', 'true');
          self._positionPanel(unit);
        }
        return;
      }
      // 选项点击
      var cell = e.target.closest('.ldp-cell');
      if (cell) {
        var selectedTrigger = cell.closest('.ldp-unit').querySelector('.ldp-trigger');
        var type = cell.dataset.type, val = +cell.dataset.val;
        if (type === 'year')  self._setYear(val);
        if (type === 'month') self._setMonth(val, cell.dataset.leap === '1');
        if (type === 'day')   self._setDay(val);
        self._closeAll();
        selectedTrigger.focus({ preventScroll: true });
        return;
      }
      // 年份翻页箭头
      var arrow = e.target.closest('.ldp-arrow');
      if (arrow && !arrow.disabled) self._pageYears(+arrow.dataset.dir);
    });

    // 浮层内键盘导航：方向键移动焦点，PageUp/PageDown 翻年，Home/End 首末
    root.addEventListener('keydown', function (e) {
      var unit = e.target.closest ? e.target.closest('.ldp-unit') : null;
      if (!unit || !unit.classList.contains('open')) return;
      var cells = Array.prototype.slice.call(unit.querySelectorAll('.ldp-cell:not(:disabled)'));
      var idx = cells.indexOf(e.target);
      var cols = unit.dataset.unit === 'day' ? 6 : 3;
      var key = e.key, next = -1;
      if (key === 'ArrowRight') next = idx + 1;
      else if (key === 'ArrowLeft') next = idx - 1;
      else if (key === 'ArrowDown') next = idx + cols;
      else if (key === 'ArrowUp') next = idx - cols;
      else if (key === 'Home') next = 0;
      else if (key === 'End') next = cells.length - 1;
      if (next >= 0 && next < cells.length) {
        e.preventDefault();
        e.stopPropagation();
        cells[next].focus({ preventScroll: true });
        return;
      }
      if ((key === 'PageDown' || key === 'PageUp') && unit.dataset.unit === 'year') {
        e.preventDefault();
        e.stopPropagation();
        self._pageYears(key === 'PageDown' ? 1 : -1);
      }
    });

    function unitHTML(key, label) {
      return '<div class="ldp-unit" data-unit="' + key + '">'
        + '<button type="button" class="ldp-trigger" aria-label="选择' + label + '" aria-expanded="false" aria-haspopup="dialog"><span class="ldp-value"></span>'
        + '<span style="color:var(--ldp-muted,#94a3b8);font-size:12px">' + label + '</span>'
        + '<span class="ldp-caret" aria-hidden="true"></span></button>'
        + '<div class="ldp-panel" role="dialog" aria-label="选择' + label + '"></div></div>';
    }
  };

  P._bindGlobal = function () {
    var self = this;
    this._onDocClick = function (e) {
      if (!self.root.contains(e.target)) self._closeAll();
    };
    this._onDocKeydown = function (e) {
      if (e.key !== 'Escape') return;
      var openUnit = self.root.querySelector('.ldp-unit.open');
      if (openUnit) {
        // 先关闭日期浮层，不同时关闭承载它的菜单。
        e.preventDefault();
        e.stopImmediatePropagation();
        self._closeAll();
        openUnit.querySelector('.ldp-trigger').focus({ preventScroll: true });
      }
    };
    this._onResize = function () {
      var openUnit = self.root.querySelector('.ldp-unit.open');
      if (openUnit) self._positionPanel(openUnit);
    };
    this._onScroll = function (e) {
      if (!e.target.closest || !e.target.closest('.ldp-panel')) self._onResize();
    };
    // Check containment before paging replaces the clicked button.
    document.addEventListener('click', this._onDocClick, true);
    document.addEventListener('keydown', this._onDocKeydown);
    window.addEventListener('resize', this._onResize);
    document.addEventListener('scroll', this._onScroll, true);
  };

  P._closeAll = function () {
    for (var k in this.units) {
      this.units[k].classList.remove('open');
      this.units[k].querySelector('.ldp-trigger').setAttribute('aria-expanded', 'false');
    }
  };

  // 固定定位不受外层菜单滚动/裁切影响；按可视区域自动向上或向下展开。
  P._positionPanel = function (unit) {
    var panel = unit.querySelector('.ldp-panel');
    var anchor = unit.querySelector('.ldp-trigger').getBoundingClientRect();
    var vw = document.documentElement.clientWidth;
    var vh = window.innerHeight;
    var prefer = unit.dataset.unit === 'day' ? (this._lunarView() ? 300 : 260) : 220;
    // 先放开宽度量一次内容自然宽度：农历的「初一/廿九」比数字宽，年面板还多了「农历」标签，
    // 写死宽度会被 grid 的 min-width 撑破，从而冒出横向滚动条。
    panel.style.minWidth = '0';
    panel.style.width = 'auto';
    panel.style.right = 'auto';
    panel.style.maxHeight = 'none';
    var width = Math.min(Math.max(prefer, panel.scrollWidth), vw - 16);
    panel.style.width = width + 'px';
    var left = unit.dataset.unit === 'day' ? anchor.right - width : anchor.left;
    panel.style.left = Math.max(8, Math.min(left, vw - width - 8)) + 'px';
    var height = panel.getBoundingClientRect().height;
    var below = vh - anchor.bottom - 14;
    var above = anchor.top - 14;
    var upward = below < height && above > below;
    var available = Math.max(24, upward ? above : below);
    panel.style.maxHeight = available + 'px';
    panel.style.top = Math.max(8, upward ? anchor.top - Math.min(height, available) - 6 : anchor.bottom + 6) + 'px';
  };

  /* ---------- 农历视图 ---------- */
  // 农历模式下当前日期对应的农历信息；不可用（关闭/超出支持范围）时返回 null
  P._lunarView = function () {
    if (!this.lunar) return null;
    return Lunar.fromSolar(this.year, this.month, this.day);
  };

  /* ---------- 可选日期范围（minDate / maxDate） ---------- */
  P._inBounds = function (y, m, d) {
    if (this._lo && cmpDate(y, m, d, this._lo.year, this._lo.month, this._lo.day) < 0) return false;
    if (this._hi && cmpDate(y, m, d, this._hi.year, this._hi.month, this._hi.day) > 0) return false;
    return true;
  };

  // 整年是否与可选范围有交集（决定年份格子是否可点）
  P._yearEnabled = function (y) {
    if (!this._lo && !this._hi) return true;
    if (this.lunar) {
      // 农历年 y 大致覆盖公历 y 年 2 月 ~ y+1 年 2 月；这里取略宽的判定，月/日格子再精确拦截
      if (this._lo && cmpDate(y + 1, 3, 1, this._lo.year, this._lo.month, this._lo.day) < 0) return false;
      if (this._hi && cmpDate(y, 1, 1, this._hi.year, this._hi.month, this._hi.day) > 0) return false;
      return true;
    }
    if (this._lo && cmpDate(y, 12, 31, this._lo.year, this._lo.month, this._lo.day) < 0) return false;
    if (this._hi && cmpDate(y, 1, 1, this._hi.year, this._hi.month, this._hi.day) > 0) return false;
    return true;
  };

  // 公历某月是否与可选范围有交集
  P._solarMonthEnabled = function (y, m) {
    if (!this._lo && !this._hi) return true;
    if (this._lo && cmpDate(y, m, daysInMonth(y, m), this._lo.year, this._lo.month, this._lo.day) < 0) return false;
    if (this._hi && cmpDate(y, m, 1, this._hi.year, this._hi.month, this._hi.day) > 0) return false;
    return true;
  };

  // 农历某月（含闰月）对应的公历区间是否与可选范围有交集
  P._lunarMonthEnabled = function (ly, mo) {
    if (!this._lo && !this._hi) return true;
    var first = Lunar.toSolar(ly, mo.m, 1, mo.isLeap);
    var last = Lunar.toSolar(ly, mo.m, mo.days, mo.isLeap);
    if (!first || !last) return true;
    if (this._lo && cmpDate(last.year, last.month, last.day, this._lo.year, this._lo.month, this._lo.day) < 0) return false;
    if (this._hi && cmpDate(first.year, first.month, first.day, this._hi.year, this._hi.month, this._hi.day) > 0) return false;
    return true;
  };

  // 农历某日换算成公历后是否在可选范围内
  P._lunarDayEnabled = function (ly, lm, ld, isLeap) {
    if (!this._lo && !this._hi) return true;
    var sol = Lunar.toSolar(ly, lm, ld, isLeap);
    if (!sol) return true;
    return this._inBounds(sol.year, sol.month, sol.day);
  };

  // 年面板可用范围：受农历算法支持范围与 minDate/maxDate 共同约束
  P._yearBounds = function () {
    var min = this.minYear, max = this.maxYear, lo, hi;
    if (this.lunar) {
      min = Math.max(min, Lunar.MIN_YEAR);
      max = Math.min(max, Lunar.MAX_YEAR);
    }
    if (this._lo) {
      lo = this.lunar ? Lunar.fromSolar(this._lo.year, this._lo.month, this._lo.day) : this._lo;
      if (lo) min = Math.max(min, lo.year);
    }
    if (this._hi) {
      hi = this.lunar ? Lunar.fromSolar(this._hi.year, this._hi.month, this._hi.day) : this._hi;
      if (hi) max = Math.min(max, hi.year);
    }
    if (min > max) max = min;
    return { min: min, max: max };
  };
  P._yearMin = function () { return this._yearBounds().min; };
  P._yearMax = function () { return this._yearBounds().max; };
  P._pageOf = function (year) {
    var min = this._yearMin();
    return min + Math.floor((year - min) / this.yearsPerPage) * this.yearsPerPage;
  };

  /* ---------- 渲染 ---------- */
  P._renderAll = function () {
    this.root.classList.toggle('lunar', !!this._lunarView());
    this.root.classList.toggle('ldp-out-of-range', !this.isInRange());
    this._renderTriggers();
    this._renderYearPanel();
    this._renderMonthPanel();
    this._renderDayPanel();
  };

  P._renderTriggers = function () {
    var lv = this._lunarView();
    var yEl = this.units.year, mEl = this.units.month, dEl = this.units.day;
    if (lv) {
      yEl.querySelector('.ldp-value').textContent = lv.year;
      mEl.querySelector('.ldp-value').textContent = (lv.isLeap ? '闰' : '') + Lunar.cnMonth(lv.month);
      dEl.querySelector('.ldp-value').textContent = Lunar.cnDay(lv.day);
      yEl.querySelector('.ldp-trigger').setAttribute('aria-label', '选择农历年，当前 ' + lv.year + ' 年');
      mEl.querySelector('.ldp-trigger').setAttribute('aria-label', '选择农历月，当前 ' + Lunar.cnMonthLabel(lv.month, lv.isLeap));
      dEl.querySelector('.ldp-trigger').setAttribute('aria-label', '选择农历日，当前 ' + Lunar.cnDay(lv.day));
      return;
    }
    yEl.querySelector('.ldp-value').textContent = this.year;
    mEl.querySelector('.ldp-value').textContent = pad(this.month);
    dEl.querySelector('.ldp-value').textContent = pad(this.day);
    yEl.querySelector('.ldp-trigger').setAttribute('aria-label', '选择年，当前 ' + this.year + ' 年');
    mEl.querySelector('.ldp-trigger').setAttribute('aria-label', '选择月，当前 ' + this.month + ' 月');
    dEl.querySelector('.ldp-trigger').setAttribute('aria-label', '选择日，当前 ' + this.day + ' 日');
  };

  // 年面板：每行3个，每页10个，可翻页
  P._renderYearPanel = function () {
    var lunar = !!this._lunarView();
    var min = this._yearMin(), max = this._yearMax();
    var start = Math.min(Math.max(this.yearPageStart, min), Math.max(min, max - this.yearsPerPage + 1));
    var end = Math.min(start + this.yearsPerPage - 1, max);
    var html = '<div class="ldp-head">'
      + '<button type="button" class="ldp-arrow" aria-label="上一页年份" data-dir="-1"' + (start <= min ? ' disabled' : '') + '>‹</button>'
      + '<span class="ldp-range">' + start + ' - ' + end + (lunar ? '<i class="ldp-tag">农历</i>' : '') + '</span>'
      + '<button type="button" class="ldp-arrow" aria-label="下一页年份" data-dir="1"' + (end >= max ? ' disabled' : '') + '>›</button>'
      + '</div><div class="ldp-grid cols-3">';
    for (var y = start; y <= end; y++) {
      var off = !this._yearEnabled(y);
      html += '<button type="button" aria-pressed="' + (y === this.year) + '" class="ldp-cell' + (y === this.year ? ' active' : '')
        + '" data-type="year" data-val="' + y + '"' + (off ? ' disabled' : '') + '>' + y + '</button>';
    }
    html += '</div>';
    this.units.year.querySelector('.ldp-panel').innerHTML = html;
    this.yearPageStart = start;
  };

  // 月面板：每行3个，一页12个（农历模式含闰月共13个）
  P._renderMonthPanel = function () {
    var lv = this._lunarView();
    var html = '<div class="ldp-grid cols-3">';
    if (lv) {
      var months = Lunar.months(lv.year) || [];
      for (var i = 0; i < months.length; i++) {
        var mo = months[i];
        var on = mo.m === lv.month && !!mo.isLeap === lv.isLeap;
        var offMo = !this._lunarMonthEnabled(lv.year, mo);
        html += '<button type="button" aria-pressed="' + on + '" class="ldp-cell' + (on ? ' active' : '') + (mo.isLeap ? ' leap' : '')
          + '" data-type="month" data-val="' + mo.m + '" data-leap="' + (mo.isLeap ? 1 : 0) + '"'
          + (offMo ? ' disabled' : '') + '>' + Lunar.cnMonthLabel(mo.m, mo.isLeap) + '</button>';
      }
    } else {
      for (var m = 1; m <= 12; m++) {
        var offM = !this._solarMonthEnabled(this.year, m);
        html += '<button type="button" aria-pressed="' + (m === this.month) + '" class="ldp-cell' + (m === this.month ? ' active' : '')
          + '" data-type="month" data-val="' + m + '" data-leap="0"' + (offM ? ' disabled' : '') + '>' + m + '月</button>';
      }
    }
    html += '</div>';
    this.units.month.querySelector('.ldp-panel').innerHTML = html;
  };

  // 日面板：每行6个，显示整月天数（农历模式为该朔望月天数）
  P._renderDayPanel = function () {
    var lv = this._lunarView();
    var total = lv ? lv.monthDays : daysInMonth(this.year, this.month);
    var current = lv ? lv.day : this.day;
    var html = '<div class="ldp-grid cols-6">';
    for (var d = 1; d <= total; d++) {
      var offD = lv
        ? !this._lunarDayEnabled(lv.year, lv.month, d, lv.isLeap)
        : !this._inBounds(this.year, this.month, d);
      html += '<button type="button" aria-pressed="' + (d === current) + '" class="ldp-cell' + (d === current ? ' active' : '')
        + '" data-type="day" data-val="' + d + '"' + (offD ? ' disabled' : '') + '>' + (lv ? Lunar.cnDay(d) : d) + '</button>';
    }
    html += '</div>';
    var panel = this.units.day.querySelector('.ldp-panel');
    panel.innerHTML = html;
  };

  /* ---------- 内部状态变更 ---------- */
  P._clampDay = function () {
    var max = daysInMonth(this.year, this.month);
    if (this.day > max) this.day = max;
  };
  // 把公历日期夹到 [minYear-01-01, maxYear-12-31]
  P._clampToRange = function () {
    if (cmpDate(this.year, this.month, this.day, this.minYear, 1, 1) < 0) {
      this.year = this.minYear; this.month = 1; this.day = 1;
    } else if (cmpDate(this.year, this.month, this.day, this.maxYear, 12, 31) > 0) {
      this.year = this.maxYear; this.month = 12; this.day = 31;
    }
    // 再夹到 minDate / maxDate（如果设了）
    if (this._lo && cmpDate(this.year, this.month, this.day, this._lo.year, this._lo.month, this._lo.day) < 0) {
      this.year = this._lo.year; this.month = this._lo.month; this.day = this._lo.day;
    }
    if (this._hi && cmpDate(this.year, this.month, this.day, this._hi.year, this._hi.month, this._hi.day) > 0) {
      this.year = this._hi.year; this.month = this._hi.month; this.day = this._hi.day;
    }
  };

  // 农历选择统一入口：把农历年月日换算成公历后再落盘
  P._applyLunar = function (ly, lm, ld, isLeap) {
    var months = Lunar.months(ly);
    if (!months) return;
    var target = null, i;
    for (i = 0; i < months.length; i++) {
      if (months[i].m === lm && !!months[i].isLeap === !!isLeap) { target = months[i]; break; }
    }
    if (!target) {
      for (i = 0; i < months.length; i++) {
        if (months[i].m === lm && !months[i].isLeap) { target = months[i]; break; }
      }
    }
    if (!target) return;
    var sol = Lunar.toSolar(ly, target.m, Math.min(Math.max(ld, 1), target.days), target.isLeap);
    if (!sol) return;
    this.year = sol.year; this.month = sol.month; this.day = sol.day;
    this._clampToRange();
    this._clampDay();
    this.yearPageStart = this._pageOf(this._lunarView() ? this._lunarView().year : this.year);
    this._afterChange();
  };

  P._setYear = function (y) {
    var lv = this._lunarView();
    if (lv) { this._applyLunar(y, lv.month, lv.day, lv.isLeap); return; }
    this.year = y; this._clampDay(); this.yearPageStart = this._pageOf(y); this._afterChange();
  };
  P._setMonth = function (m, isLeap) {
    var lv = this._lunarView();
    if (lv) { this._applyLunar(lv.year, m, lv.day, isLeap); return; }
    this.month = m; this._clampDay(); this._afterChange();
  };
  P._setDay = function (d) {
    var lv = this._lunarView();
    if (lv) { this._applyLunar(lv.year, lv.month, d, lv.isLeap); return; }
    this.day = d; this._afterChange();
  };

  // 年份翻页（箭头按钮与 PageUp/PageDown 共用）
  P._pageYears = function (dir) {
    var min = this._yearMin(), max = this._yearMax();
    var start = this.yearPageStart + dir * this.yearsPerPage;
    start = Math.min(Math.max(start, min), Math.max(min, max - this.yearsPerPage + 1));
    if (start === this.yearPageStart) return;
    this.yearPageStart = start;
    this._renderYearPanel();
    var unit = this.units.year;
    if (unit.classList.contains('open')) this._positionPanel(unit);
    var focused = unit.querySelector('.ldp-cell.active') || unit.querySelector('[data-dir="' + dir + '"]:not(:disabled)');
    if (focused) focused.focus({ preventScroll: true });
  };

  P._afterChange = function (silent) {
    this._renderAll();
    if (silent) return;
    var self = this;
    this._listeners.change.forEach(function (cb) {
      cb(self.getDate(), self.getValue());
    });
  };

  /* ---------- 公开 API ---------- */
  P.getDate = function () {
    var d = new Date(this.year, this.month - 1, this.day);
    d.setFullYear(this.year);   // 避免 0-99 年被映射到 1900-1999
    return d;
  };

  P.getValue = function (fmt) {
    fmt = fmt || 'YYYY-MM-DD';
    return fmt
      .replace(/YYYY/g, pad4(this.year))
      .replace(/MM/g, pad(this.month))
      .replace(/DD/g, pad(this.day));
  };

  // 当前日期对应的农历（不可用时返回 null）
  P.getLunarDate = function () { return Lunar.fromSolar(this.year, this.month, this.day); };

  // 农历中文串，例如「2026年八月廿四」；闰月形如「2025年闰六月初一」
  P.getLunarValue = function () {
    var lv = this.getLunarDate();
    if (!lv) return '';
    return lv.year + '年' + Lunar.cnMonthLabel(lv.month, lv.isLeap) + Lunar.cnDay(lv.day);
  };

  // 切换农历显示。开关状态是"粘性"的：当前日期无法换算农历（如公历 0 年）时，
  // 面板临时按公历显示，日期回到支持范围后自动恢复农历。
  P.setLunar = function (on) {
    on = !!on;
    if (on === this.lunar) return this.lunar;
    this.lunar = on;
    var lv = this._lunarView();
    this.yearPageStart = this._pageOf(lv ? lv.year : this.year);
    this._renderAll();
    var openUnit = this.root.querySelector('.ldp-unit.open');
    if (openUnit) this._positionPanel(openUnit);
    return this.lunar;
  };

  P.isLunar = function () { return !!this._lunarView(); };

  P.setDate = function (input, options) {
    var d = parseDate(input);
    this.year = d.year;
    this.month = d.month;
    this.day = d.day;
    this._clampToRange();
    this._clampDay();
    var lv = this._lunarView();
    this.yearPageStart = this._pageOf(lv ? lv.year : this.year);
    this._afterChange(!!(options && options.silent));
    return this;
  };

  // 直接设定农历日期（超出范围或非法日期会被夹紧）
  P.setLunarDate = function (ly, lm, ld, isLeap) {
    if (!Lunar.supported(ly)) return this;
    var sol = Lunar.toSolar(ly, lm, ld, isLeap)
      || Lunar.toSolar(ly, lm, Lunar.monthDays(ly, lm, isLeap), isLeap);
    if (!sol) return this;
    return this.setDate({ year: sol.year, month: sol.month, day: sol.day });
  };

  /* ---------- 可选日期范围（minDate / maxDate） ---------- */
  // 语义与原生 <input type="date"> 的 min/max 一致：只限制「还能选什么」，
  // 不改写已有的日期，也不触发 change。当前值落在界外时根节点带 .ldp-out-of-range，
  // 宿主可用 picker.isInRange() 自查（导出面板就是靠这个 + 字符串比较给出提示）。
  // 之后任何 setDate / 点格子 / 键盘导航都会把日期夹回范围内。
  P.setMinDate = function (input) { return this._setBound('lo', toBound(input)); };

  P.setMaxDate = function (input) { return this._setBound('hi', toBound(input)); };

  P.getMinDate = function () { return this._lo ? fmtDate(this._lo.year, this._lo.month, this._lo.day) : null; };

  P.getMaxDate = function () { return this._hi ? fmtDate(this._hi.year, this._hi.month, this._hi.day) : null; };

  // 当前日期是否落在 [minDate, maxDate] 内（没设界时恒为 true）
  P.isInRange = function () { return this._inBounds(this.year, this.month, this.day); };

  P._setBound = function (which, bound) {
    this['_' + which] = bound;
    normalizeBounds(this);
    this._renderAll();
    var openUnit = this.root.querySelector('.ldp-unit.open');
    if (openUnit) this._positionPanel(openUnit);
    return this;
  };

  P.close = function () { this._closeAll(); return this; };

  P.reposition = function () {
    var unit = this.root.querySelector('.ldp-unit.open');
    if (unit) this._positionPanel(unit);
    return this;
  };

  P.on = function (event, cb) {
    if (this._listeners[event] && typeof cb === 'function') this._listeners[event].push(cb);
    return this;
  };

  P.destroy = function () {
    document.removeEventListener('click', this._onDocClick, true);
    document.removeEventListener('keydown', this._onDocKeydown);
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('scroll', this._onScroll, true);
    if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    this._listeners = { change: [] };
  };

  LiteDatePicker.LunarCal = LunarCal;
  LiteDatePicker.Lunar = Lunar;
  global.LiteDatePicker = LiteDatePicker;
})(typeof window !== 'undefined' ? window : this);
