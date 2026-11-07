/**
 * api_behaviors.gs
 * จัดการคะแนนความประพฤติและพฤติกรรมเชิงบวก/ลบ
 */

function apiListBehaviorTypes(token) {
  var types = getRows("BehaviorTypes");
  if (!types.length) {
    types = [
      { TypeID: "BT1", TypeName: "มีจิตสาธารณะ / ช่วยเหลืองานครู", Category: "positive", DefaultPoints: 1, Icon: "volunteer_activism" },
      { TypeID: "BT2", TypeName: "ส่งงานตรงเวลาสม่ำเสมอ", Category: "positive", DefaultPoints: 1, Icon: "task_alt" },
      { TypeID: "BT3", TypeName: "เป็นผู้นำและช่วยเหลือเพื่อน", Category: "positive", DefaultPoints: 2, Icon: "stars" },
      { TypeID: "BT4", TypeName: "ขาดส่งงานเกินกำหนด", Category: "negative", DefaultPoints: -1, Icon: "warning" },
      { TypeID: "BT5", TypeName: "ไม่ตั้งใจเรียน / กวนสมาธิผู้อื่น", Category: "negative", DefaultPoints: -1, Icon: "do_not_disturb_on" }
    ];
  }
  return types;
}

function apiSaveBehaviorType(token, data) {
  var session = apiValidateSession(token);
  if (session.role !== "admin") throw new Error("เฉพาะแอดมินเท่านั้นที่จัดการประเภทพฤติกรรมได้");
  
  var id = data.TypeID;
  if (!id) {
    id = "BT" + new Date().getTime();
    data.TypeID = id;
    insertRow("BehaviorTypes", data, ["TypeID", "TypeName", "Category", "DefaultPoints", "Icon"]);
  } else {
    updateRow("BehaviorTypes", "TypeID", id, data);
  }
  return { success: true, TypeID: id };
}

function apiDeleteBehaviorType(token, id) {
  var session = apiValidateSession(token);
  if (session.role !== "admin") throw new Error("เฉพาะแอดมินเท่านั้นที่ลบประเภทพฤติกรรมได้");
  deleteRow("BehaviorTypes", "TypeID", id);
  return { success: true };
}

function apiAddBehavior(token, data) {
  var session = apiValidateSession(token);
  if (session.role === "student") throw new Error("ไม่มีสิทธิ์บันทึกพฤติกรรม");
  
  var id = "BH" + new Date().getTime();
  var entry = {
    BehaviorID: id,
    StudentID: data.StudentID,
    ClassID: data.ClassID || "",
    TypeID: data.TypeID || "",
    Points: Number(data.Points || 1),
    Note: data.Note || "",
    Date: data.Date ? new Date(data.Date).toISOString() : new Date().toISOString(),
    CreatedBy: session.userId
  };
  
  insertRow("Behaviors", entry, ["BehaviorID", "StudentID", "ClassID", "TypeID", "Points", "Note", "Date", "CreatedBy"]);
  writeLog("ADD_BEHAVIOR", "บันทึกพฤติกรรมให้นักเรียน " + data.StudentID + " (" + entry.Points + " คะแนน)", session.userId);
  return { success: true, BehaviorID: id };
}

function apiDeleteBehavior(token, id) {
  var session = apiValidateSession(token);
  if (session.role === "student") throw new Error("ไม่มีสิทธิ์ลบพฤติกรรม");
  deleteRow("Behaviors", "BehaviorID", id);
  writeLog("DELETE_BEHAVIOR", "ลบพฤติกรรมรหัส: " + id, session.userId);
  return { success: true };
}

function apiGetClassBehavior(token, classId) {
  var students = apiListStudents(token, classId);
  var studentMap = {};
  for (var i = 0; i < students.length; i++) studentMap[String(students[i].StudentID)] = students[i];
  
  var sIds = Object.keys(studentMap);
  var behaviors = getRows("Behaviors").filter(function(b) {
    return sIds.indexOf(String(b.StudentID)) !== -1;
  });
  
  var bTypes = apiListBehaviorTypes(token);
  var typeMap = {};
  for (var j = 0; j < bTypes.length; j++) typeMap[String(bTypes[j].TypeID)] = bTypes[j];
  
  var totalPositive = 0;
  var totalNegative = 0;
  var pointsByStudent = {};
  
  var rows = behaviors.map(function(b) {
    var s = studentMap[String(b.StudentID)] || {};
    var t = typeMap[String(b.TypeID)] || {};
    var pts = Number(b.Points || 0);
    if (pts > 0) totalPositive += pts;
    else totalNegative += Math.abs(pts);
    
    var sid = String(b.StudentID);
    pointsByStudent[sid] = (pointsByStudent[sid] || 0) + pts;
    
    return {
      BehaviorID: b.BehaviorID,
      StudentID: b.StudentID,
      No: s.No || "",
      FullName: s.FullName || "",
      TypeName: t.TypeName || "พฤติกรรม",
      Category: t.Category || (pts >= 0 ? "positive" : "negative"),
      Points: pts,
      Note: b.Note || "",
      Date: b.Date || ""
    };
  });
  
  rows.sort(function(a, b) { return new Date(b.Date) - new Date(a.Date); });
  
  return {
    rows: rows,
    summary: {
      totalPositive: totalPositive,
      totalNegative: totalNegative,
      totalEntries: rows.length
    }
  };
}
