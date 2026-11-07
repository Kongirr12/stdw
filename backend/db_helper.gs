/**
 * db_helper.gs
 * จัดการการอ่าน/เขียนข้อมูลบน Google Sheets (Data Access Layer)
 * พร้อมระบบ Universal Header Normalizer (รองรับทั้งหัวตารางแบบมีช่องว่างและไม่มีช่องว่าง)
 * และระบบ In-Memory Caching + ScriptCache เพื่อความเร็วระดับสูงสุด
 */

var _ss = null;
var _sheetCache = {};
var _rowsMemCache = {};

function getSS() {
  if (_ss) return _ss;
  try {
    _ss = SpreadsheetApp.getActiveSpreadsheet();
    return _ss;
  } catch (e) {
    var id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
    if (id) {
      _ss = SpreadsheetApp.openById(id);
      return _ss;
    }
    throw new Error("ไม่พบ Spreadsheet ที่เชื่อมต่ออยู่ กรุณาเปิด Apps Script จาก Google Sheets");
  }
}

function getSheet(sheetName, defaultHeaders) {
  if (_sheetCache[sheetName]) return _sheetCache[sheetName];
  var ss = getSS();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (defaultHeaders && defaultHeaders.length) {
      sheet.appendRow(defaultHeaders);
      sheet.getRange(1, 1, 1, defaultHeaders.length).setFontWeight("bold").setBackground("#F3F4F6");
      sheet.setFrozenRows(1);
    }
  } else if (defaultHeaders && defaultHeaders.length && sheet.getLastRow() === 0) {
    sheet.appendRow(defaultHeaders);
    sheet.getRange(1, 1, 1, defaultHeaders.length).setFontWeight("bold").setBackground("#F3F4F6");
    sheet.setFrozenRows(1);
  }
  _sheetCache[sheetName] = sheet;
  return sheet;
}

function invalidateSheetCache(sheetName) {
  delete _rowsMemCache[sheetName];
  try {
    CacheService.getScriptCache().remove("rows_" + sheetName);
  } catch (e) {}
}

function findColIndex(headers, key) {
  var keyNorm = String(key || "").replace(/[\s_]+/g, '').toLowerCase();
  for (var c = 0; c < headers.length; c++) {
    var hNorm = String(headers[c] || "").replace(/[\s_]+/g, '').toLowerCase();
    if (hNorm === keyNorm) return c;
  }
  return -1;
}

function getRows(sheetName) {
  // 1. ตรวจสอบ In-Memory Cache ภายใน Request เดียวกัน (ความเร็ว 0ms)
  if (_rowsMemCache[sheetName]) return _rowsMemCache[sheetName];
  
  // 2. ตรวจสอบ ScriptCache สำหรับตารางตั้งค่าหลัก (ความเร็ว ~10-20ms)
  var cacheable = {
    "GeneralSettings": true,
    "AcademicYears": true,
    "Classes": true,
    "Subjects": true,
    "BehaviorTypes": true,
    "ScoreSettings": true,
    "GradeScale": true
  };
  
  var scriptCache = CacheService.getScriptCache();
  var ck = "rows_" + sheetName;
  if (cacheable[sheetName]) {
    var cached = scriptCache.get(ck);
    if (cached) {
      try {
        var parsed = JSON.parse(cached);
        _rowsMemCache[sheetName] = parsed;
        return parsed;
      } catch (e) {}
    }
  }
  
  // 3. อ่านตรงจาก Google Sheet ครั้งเดียวแบบ Bulk
  var sheet = getSheet(sheetName);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol === 0) {
    _rowsMemCache[sheetName] = [];
    return [];
  }
  
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0];
  var rows = [];
  
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var isEmpty = true;
    for (var c = 0; c < row.length; c++) {
      if (row[c] !== "" && row[c] !== null && row[c] !== undefined) {
        isEmpty = false; break;
      }
    }
    if (isEmpty) continue;
    
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var rawH = String(headers[j]).trim();
      if (!rawH) continue;
      var val = row[j];
      
      // เก็บค่าแบบเดิม
      obj[rawH] = val;
      
      // ปรับจูนชื่อคีย์ให้ตรงกันเสมอ (Universal Normalizer)
      var noSpace = rawH.replace(/\s+/g, '');
      obj[noSpace] = val;
      
      var lower = noSpace.toLowerCase();
      if (lower === 'studentid' || lower === 'student_id') obj['StudentID'] = val;
      if (lower === 'firstname' || lower === 'first_name') obj['FirstName'] = val;
      if (lower === 'lastname' || lower === 'last_name') obj['LastName'] = val;
      if (lower === 'fullname' || lower === 'name') obj['FullName'] = val;
      if (lower === 'number' || lower === 'no') { obj['No'] = val; obj['Number'] = val; }
      if (lower === 'classid' || lower === 'class_id') obj['ClassID'] = val;
      if (lower === 'classname' || lower === 'class_name') obj['ClassName'] = val;
      if (lower === 'subjectid' || lower === 'subject_id') obj['SubjectID'] = val;
      if (lower === 'subjectname' || lower === 'subject_name') obj['SubjectName'] = val;
      if (lower === 'subjectcode' || lower === 'subject_code') obj['SubjectCode'] = val;
      if (lower === 'assignmentid' || lower === 'assignment_id') obj['AssignmentID'] = val;
      if (lower === 'duedate' || lower === 'due_date') obj['DueDate'] = val;
      if (lower === 'fullscore' || lower === 'maxscore' || lower === 'max_score') { obj['FullScore'] = val; obj['MaxScore'] = val; }
      if (lower === 'teacherid' || lower === 'teacher_id') obj['TeacherID'] = val;
      if (lower === 'userid' || lower === 'user_id') obj['UserID'] = val;
      if (lower === 'statusid' || lower === 'status_id') obj['StatusID'] = val;
    }
    
    // Auto-compute FullName if missing
    if (!obj['FullName'] && (obj['FirstName'] || obj['LastName'])) {
      obj['FullName'] = ((obj['Title'] || '') + obj['FirstName'] + ' ' + (obj['LastName'] || '')).trim();
    }
    
    obj["_rowIndex"] = i + 1;
    rows.push(obj);
  }
  
  _rowsMemCache[sheetName] = rows;
  
  if (cacheable[sheetName] && rows.length <= 150) {
    try {
      scriptCache.put(ck, JSON.stringify(rows), 600);
    } catch (e) {}
  }
  
  return rows;
}

function getRowById(sheetName, idColumn, idValue) {
  var rows = getRows(sheetName);
  var idNorm = String(idColumn).replace(/[\s_]+/g, '').toLowerCase();
  for (var i = 0; i < rows.length; i++) {
    var val = rows[i][idColumn] || rows[i][idNorm] || rows[i][String(idColumn).replace(/\s+/g, '')];
    if (String(val) === String(idValue)) {
      return rows[i];
    }
  }
  return null;
}

function findRows(sheetName, predicate) {
  var rows = getRows(sheetName);
  return rows.filter(predicate);
}

function withLock(callback) {
  // สำหรับการเขียนข้อมูลสำคัญ ให้ใช้ Lock สั้นๆ ไม่ให้บล็อกนาน
  var lock = LockService.getScriptLock();
  var success = lock.tryLock(5000);
  if (!success) {
    // ถ้า Lock ไม่ทัน ให้ดำเนินการต่อโดยระวัง (Graceful fallback)
    return callback();
  }
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function insertRow(sheetName, rowData, defaultHeaders) {
  return withLock(function() {
    var sheet = getSheet(sheetName, defaultHeaders);
    var lastCol = sheet.getLastColumn();
    var headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : (defaultHeaders || []);
    
    var row = [];
    for (var i = 0; i < headers.length; i++) {
      var h = headers[i];
      var idx = findColIndex([h], Object.keys(rowData)[0]); // helper
      var val = rowData[h];
      if (val === undefined) {
        var hNorm = String(h).replace(/[\s_]+/g, '').toLowerCase();
        for (var k in rowData) {
          if (String(k).replace(/[\s_]+/g, '').toLowerCase() === hNorm) {
            val = rowData[k];
            break;
          }
        }
      }
      row.push(val !== undefined && val !== null ? val : "");
    }
    sheet.appendRow(row);
    invalidateSheetCache(sheetName);
    return true;
  });
}

function insertRows(sheetName, rowsData, defaultHeaders) {
  if (!rowsData || !rowsData.length) return true;
  return withLock(function() {
    var sheet = getSheet(sheetName, defaultHeaders);
    var lastCol = sheet.getLastColumn();
    var headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : (defaultHeaders || []);
    
    var matrix = [];
    for (var r = 0; r < rowsData.length; r++) {
      var row = [];
      var rData = rowsData[r];
      for (var c = 0; c < headers.length; c++) {
        var h = headers[c];
        var val = rData[h];
        if (val === undefined) {
          var hNorm = String(h).replace(/[\s_]+/g, '').toLowerCase();
          for (var k in rData) {
            if (String(k).replace(/[\s_]+/g, '').toLowerCase() === hNorm) {
              val = rData[k];
              break;
            }
          }
        }
        row.push(val !== undefined && val !== null ? val : "");
      }
      matrix.push(row);
    }
    
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, matrix.length, headers.length).setValues(matrix);
    invalidateSheetCache(sheetName);
    return true;
  });
}

function updateRow(sheetName, idColumn, idValue, updateData) {
  return withLock(function() {
    var rows = getRows(sheetName);
    var sheet = getSheet(sheetName);
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    var idNorm = String(idColumn).replace(/[\s_]+/g, '').toLowerCase();
    for (var i = 0; i < rows.length; i++) {
      var currentId = rows[i][idColumn] || rows[i][idNorm] || rows[i][String(idColumn).replace(/\s+/g, '')];
      if (String(currentId) === String(idValue)) {
        var rowIndex = rows[i]._rowIndex;
        for (var key in updateData) {
          var colIdx = findColIndex(headers, key);
          if (colIdx !== -1) {
            sheet.getRange(rowIndex, colIdx + 1).setValue(updateData[key]);
          }
        }
        invalidateSheetCache(sheetName);
        return true;
      }
    }
    return false;
  });
}

function deleteRow(sheetName, idColumn, idValue) {
  return withLock(function() {
    var rows = getRows(sheetName);
    var sheet = getSheet(sheetName);
    var idNorm = String(idColumn).replace(/[\s_]+/g, '').toLowerCase();
    for (var i = 0; i < rows.length; i++) {
      var currentId = rows[i][idColumn] || rows[i][idNorm] || rows[i][String(idColumn).replace(/\s+/g, '')];
      if (String(currentId) === String(idValue)) {
        sheet.deleteRow(rows[i]._rowIndex);
        invalidateSheetCache(sheetName);
        return true;
      }
    }
    return false;
  });
}

function deleteRowsByIds(sheetName, idColumn, idValues) {
  if (!idValues || !idValues.length) return true;
  return withLock(function() {
    var set = {};
    for (var k = 0; k < idValues.length; k++) set[String(idValues[k])] = true;
    
    var rows = getRows(sheetName);
    var sheet = getSheet(sheetName);
    var idNorm = String(idColumn).replace(/[\s_]+/g, '').toLowerCase();
    for (var i = rows.length - 1; i >= 0; i--) {
      var currentId = rows[i][idColumn] || rows[i][idNorm] || rows[i][String(idColumn).replace(/\s+/g, '')];
      if (set[String(currentId)]) {
        sheet.deleteRow(rows[i]._rowIndex);
      }
    }
    invalidateSheetCache(sheetName);
    return true;
  });
}

function getSetting(key, defVal) {
  var cache = CacheService.getScriptCache();
  var cached = cache.get("setting_" + key);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }
  
  var props = PropertiesService.getScriptProperties();
  var val = props.getProperty(key);
  if (val !== null && val !== undefined) {
    try {
      var res = JSON.parse(val);
      try { cache.put("setting_" + key, JSON.stringify(res), 1800); } catch (e) {}
      return res;
    } catch (e) {
      return val;
    }
  }
  return defVal;
}

function setSetting(key, val) {
  var props = PropertiesService.getScriptProperties();
  var str = typeof val === "object" ? JSON.stringify(val) : String(val);
  props.setProperty(key, str);
  try {
    CacheService.getScriptCache().put("setting_" + key, str, 1800);
  } catch (e) {}
  return true;
}

function writeLog(action, details, userId) {
  try {
    insertRow("Logs", {
      LogID: "LOG" + new Date().getTime(),
      Timestamp: new Date().toISOString(),
      UserID: userId || "",
      Action: action || "",
      Details: typeof details === "object" ? JSON.stringify(details) : String(details || "")
    }, ["LogID", "Timestamp", "UserID", "Action", "Details"]);
  } catch (e) {}
}
