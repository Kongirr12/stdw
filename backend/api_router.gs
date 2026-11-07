/**
 * api_router.gs
 * ตัวรับคำขอ API จาก GitHub Pages (REST API Gateway for Google Apps Script)
 */

function doPost(e) {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return responseJson({ success: false, message: "Invalid request: empty payload" });
    }
    
    var payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return responseJson({ success: false, message: "JSON parse error: " + parseErr.message });
    }
    
    var action = payload.action;
    var params = payload.parameters || payload.args || [];
    if (!Array.isArray(params)) params = [params];
    
    // ค้นหาฟังก์ชันใน global scope
    var fn = globalThis[action] || this[action];
    if (typeof fn !== 'function') {
      return responseJson({ success: false, message: "Action '" + action + "' not found on server" });
    }
    
    // เรียกทำงานฟังก์ชัน
    var result = fn.apply(null, params);
    
    // ส่งคืนข้อมูล
    return responseJson({
      success: true,
      data: result !== undefined ? result : null
    });
    
  } catch (error) {
    Logger.log("[API ERROR] " + error.toString() + "\n" + (error.stack || ""));
    return responseJson({
      success: false,
      message: error.message || error.toString(),
      code: error.code || "SERVER_ERROR"
    });
  }
}

function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "status";
  
  if (action === "setup") {
    try {
      var res = setupDatabase();
      return responseJson({ success: true, message: "Setup completed successfully", detail: res });
    } catch (err) {
      return responseJson({ success: false, message: err.message });
    }
  }
  
  return responseJson({
    success: true,
    status: "online",
    service: "Smart Student Work Management System 2026 API",
    timestamp: new Date().toISOString()
  });
}

function responseJson(data) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
