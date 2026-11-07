/**
 * db_helper.gs
 * จัดการการอ่าน/เขียนข้อมูลบน Google Sheets (Data Access Layer)
 */

function getSS() {
  try {
    return SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    var id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
    if (id) return SpreadsheetApp.openById(id);
    throw new Error("ไม่พบ Spreadsheet ที่เชื่อมต่ออยู่ กรุณาเปิด Apps Script จาก Google Sheets");
  }
}

function getSheet(sheetName, defaultHeaders) {
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
  return sheet;
}

function getRows(sheetName) {
  var sheet = getSheet(sheetName);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol === 0) return [];
  
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0];
  var rows = [];
  
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    // ข้ามแถวที่ว่างเปล่าทั้งหมด
    var isEmpty = row.every(function(cell) { return cell === "" || cell === null || cell === undefined; });
    if (isEmpty) continue;
    
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var header = String(headers[j]).trim();
      if (!header) continue;
      obj[header] = row[j];
    }
    obj["_rowIndex"] = i + 1; // 1-indexed row in sheet
    rows.push(obj);
  }
  return rows;
}

function getRowById(sheetName, idColumn, idValue) {
  var rows = getRows(sheetName);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][idColumn]) === String(idValue)) {
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
  var lock = LockService.getScriptLock();
  var success = lock.tryLock(20000); // รอได้ถึง 20 วินาที
  if (!success) {
    throw new Error("เซิร์ฟเวอร์กำลังประมวลผลคำสั่งอื่นอยู่ กรุณาลองใหม่อีกครั้งในอีกสักครู่");
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
      var h = String(headers[i]).trim();
      var val = rowData[h];
      row.push(val !== undefined && val !== null ? val : "");
    }
    sheet.appendRow(row);
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
      for (var c = 0; c < headers.length; c++) {
        var h = String(headers[c]).trim();
        var val = rowsData[r][h];
        row.push(val !== undefined && val !== null ? val : "");
      }
      matrix.push(row);
    }
    
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, matrix.length, headers.length).setValues(matrix);
    return true;
  });
}

function updateRow(sheetName, idColumn, idValue, updateData) {
  return withLock(function() {
    var rows = getRows(sheetName);
    var sheet = getSheet(sheetName);
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][idColumn]) === String(idValue)) {
        var rowIndex = rows[i]._rowIndex;
        for (var key in updateData) {
          var colIdx = headers.indexOf(key);
          if (colIdx !== -1) {
            sheet.getRange(rowIndex, colIdx + 1).setValue(updateData[key]);
          }
        }
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
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][idColumn]) === String(idValue)) {
        sheet.deleteRow(rows[i]._rowIndex);
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
    // ลบจากล่างขึ้นบน เพื่อไม่ให้ index เลื่อน
    for (var i = rows.length - 1; i >= 0; i--) {
      if (set[String(rows[i][idColumn])]) {
        sheet.deleteRow(rows[i]._rowIndex);
      }
    }
    return true;
  });
}

function getSetting(key, defVal) {
  var props = PropertiesService.getScriptProperties();
  var val = props.getProperty(key);
  if (val !== null && val !== undefined) {
    try { return JSON.parse(val); } catch (e) { return val; }
  }
  return defVal;
}

function setSetting(key, val) {
  var props = PropertiesService.getScriptProperties();
  var str = typeof val === "object" ? JSON.stringify(val) : String(val);
  props.setProperty(key, str);
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
  } catch (e) {
    Logger.log("writeLog error: " + e.message);
  }
}
