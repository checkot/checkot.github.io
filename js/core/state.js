/* ==========================================================================
   STATE.JS - Shared Application State, Caches, and Directory Objects
   ========================================================================== */

let RATE_TABLE = JSON.parse(JSON.stringify(DEFAULT_RATE_TABLE));
let AREA_MAP = {};
let AREA_DETAILS = {};
let AREA_SUBS = {};
let DESIG_RATES = {};
let AREA_MAP_LOADED = false;

let currentSearchId = "";
let currentMonth = "";
let currentResult = null;
let currentToken = 0;

let currentPermanentPage = 'search';
let currentSideDrawerPage = null;

const monthIndexMemoryCache = {};
const _monthLastNightCache = {};
const _monthDatasetMetaCache = {};
const _monthInflight = {};
const _monthPersisted = {};

let ABSENT_STORE = {
  version: 1,
  activeDate: new Date().toISOString().slice(0, 10),
  updatedAt: new Date().toISOString(),
  records: {},
  auditLog: [],
  byDate: {},
  longTermLeaves: []
};

let _memAppMode = 'normal';
let _memInchargeRole = '';
let _memInchargeArea = 'all';
