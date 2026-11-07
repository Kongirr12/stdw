/**
 * api_assignments_check.gs
 * จัดการงาน การเช็คงาน ตรวจการส่งงาน และเมทริกซ์ติดตามงาน
 */

function apiListAssignments(token, classId, subjectId) {
  var assignments = getRows("Assignments");
  if (classId) {
    assignments = assignments.filter(function(a) { return String(a.ClassID) === String(classId); });
  }
  if (subjectId) {
    assignments = assignments.filter(function(a) { return String(a.SubjectID) === String(subjectId); });
  }
  
  assignments.sort(function(a, b) {
    return (Number(a.SeqNo) || 0) - (Number(b.SeqNo) || 0);
  });
  return assignments;
}

function provisionStatusRows(assignmentId, classId) {
  var students = getRows("Students").filter(function(s) {
    return String(s.ClassID) === String(classId);
  });
  
  var existingStatuses = getRows("AssignmentStatus").filter(function(r) {
    return String(r.AssignmentID) === String(assignmentId);
  });
  var existingMap = {};
  for (var i = 0; i < existingStatuses.length; i++) {
    existingMap[String(existingStatuses[i].StudentID)] = true;
  }
  
  var toInsert = [];
  for (var j = 0; j < students.length; j++) {
    var s = students[j];
    if (!existingMap[String(s.StudentID)]) {
      toInsert.push({
        StatusID: "ST_" + assignmentId + "_" + s.StudentID,
        AssignmentID: assignmentId,
        StudentID: s.StudentID,
        Status: "not_submitted",
        Score: "",
        Note: "",
        RubricScore: "",
        SubmitDate: "",
        CheckDate: ""
      });
    }
  }
  
  if (toInsert.length > 0) {
    insertRows("AssignmentStatus", toInsert, ["StatusID", "AssignmentID", "StudentID", "Status", "Score", "Note", "RubricScore", "SubmitDate", "CheckDate"]);
  }
}

function apiSaveAssignment(token, assignmentData) {
  var session = apiValidateSession(token);
  if (session.role === "student") throw new Error("ไม่มีสิทธิ์สร้างหรือแก้ไขงาน");
  
  var id = assignmentData.AssignmentID;
  var isNew = !id;
  
  if (isNew) {
    id = "ASN" + new Date().getTime();
    assignmentData.AssignmentID = id;
    
    // หาเลขลำดับ SeqNo ถัดไปในวิชานั้น
    if (!assignmentData.SeqNo) {
      var exist = apiListAssignments(token, assignmentData.ClassID, assignmentData.SubjectID);
      var maxSeq = 0;
      for (var i = 0; i < exist.length; i++) {
        var s = Number(exist[i].SeqNo || 0);
        if (s > maxSeq) maxSeq = s;
      }
      assignmentData.SeqNo = maxSeq + 1;
    }
    
    insertRow("Assignments", assignmentData, ["AssignmentID", "SubjectID", "ClassID", "SeqNo", "Title", "Description", "FullScore", "AssignDate", "DueDate", "Weight", "Type", "RubricID", "AttachLinks"]);
    provisionStatusRows(id, assignmentData.ClassID);
    writeLog("CREATE_ASSIGNMENT", "สร้างงาน: " + assignmentData.Title, session.userId);
  } else {
    updateRow("Assignments", "AssignmentID", id, assignmentData);
    provisionStatusRows(id, assignmentData.ClassID);
    writeLog("UPDATE_ASSIGNMENT", "แก้ไขงาน: " + assignmentData.Title, session.userId);
  }
  
  return { success: true, AssignmentID: id };
}

function apiDuplicateAssignment(token, assignmentId, overrides) {
  var session = apiValidateSession(token);
  if (session.role === "student") throw new Error("ไม่มีสิทธิ์คัดลอกงาน");
  
  var original = getRowById("Assignments", "AssignmentID", assignmentId);
  if (!original) throw new Error("ไม่พบงานต้นฉบับ");
  
  var copy = Object.assign({}, original, overrides || {});
  copy.AssignmentID = "ASN" + new Date().getTime();
  
  // หาเลขลำดับถัดไป
  var exist = apiListAssignments(token, copy.ClassID, copy.SubjectID);
  copy.SeqNo = (exist.length ? Math.max.apply(null, exist.map(function(x) { return Number(x.SeqNo || 0); })) : 0) + 1;
  
  insertRow("Assignments", copy, ["AssignmentID", "SubjectID", "ClassID", "SeqNo", "Title", "Description", "FullScore", "AssignDate", "DueDate", "Weight", "Type", "RubricID", "AttachLinks"]);
  provisionStatusRows(copy.AssignmentID, copy.ClassID);
  
  writeLog("DUPLICATE_ASSIGNMENT", "คัดลอกงานเป็น: " + copy.Title, session.userId);
  return { success: true, AssignmentID: copy.AssignmentID };
}

function apiDeleteAssignment(token, assignmentId) {
  var session = apiValidateSession(token);
  if (session.role === "student") throw new Error("ไม่มีสิทธิ์ลบงาน");
  
  deleteRow("Assignments", "AssignmentID", assignmentId);
  
  // ลบข้อมูลสถานะการส่งงานที่เกี่ยวข้องทั้งหมด
  var statusRows = getRows("AssignmentStatus").filter(function(r) {
    return String(r.AssignmentID) === String(assignmentId);
  });
  deleteRowsByIds("AssignmentStatus", "StatusID", statusRows.map(function(r) { return r.StatusID; }));
  
  writeLog("DELETE_ASSIGNMENT", "ลบงานรหัส: " + assignmentId, session.userId);
  return { success: true };
}

function apiGetCheckTable(token, assignmentId) {
  var a = getRowById("Assignments", "AssignmentID", assignmentId);
  if (!a) throw new Error("ไม่พบงานที่เลือก");
  
  // เผื่อมีนักเรียนใหม่ ให้ auto-provision ไว้เสมอ
  provisionStatusRows(assignmentId, a.ClassID);
  
  var students = apiListStudents(token, a.ClassID);
  var statusRows = getRows("AssignmentStatus").filter(function(r) {
    return String(r.AssignmentID) === String(assignmentId);
  });
  
  var statusMap = {};
  for (var i = 0; i < statusRows.length; i++) {
    statusMap[String(statusRows[i].StudentID)] = statusRows[i];
  }
  
  var rows = students.map(function(s) {
    var st = statusMap[String(s.StudentID)] || {};
    return {
      StatusID: st.StatusID || ("ST_" + assignmentId + "_" + s.StudentID),
      StudentID: s.StudentID,
      No: s.No,
      FullName: s.FullName,
      Status: st.Status || "not_submitted",
      Score: st.Score !== undefined ? st.Score : "",
      Note: st.Note || "",
      RubricScore: st.RubricScore || "",
      SubmitDate: st.SubmitDate || "",
      CheckDate: st.CheckDate || ""
    };
  });
  
  return {
    assignment: a,
    rows: rows
  };
}

function apiUpdateAssignmentStatus(token, statusId, patch) {
  var session = apiValidateSession(token);
  if (session.role === "student") throw new Error("ไม่มีสิทธิ์แก้ไขผลการตรวจงาน");
  
  if (patch.RubricScore && typeof patch.RubricScore === "object") {
    patch.RubricScore = JSON.stringify(patch.RubricScore);
  }
  patch.CheckDate = new Date().toISOString();
  
  var success = updateRow("AssignmentStatus", "StatusID", statusId, patch);
  if (!success) {
    // ถ้ายังไม่มีแถว ให้สร้างใหม่
    var parts = String(statusId).split("_");
    if (parts.length >= 3) {
      var aId = parts[1];
      var sId = parts[2];
      var newRow = Object.assign({
        StatusID: statusId,
        AssignmentID: aId,
        StudentID: sId,
        Status: "not_submitted",
        Score: "",
        Note: ""
      }, patch);
      insertRow("AssignmentStatus", newRow, ["StatusID", "AssignmentID", "StudentID", "Status", "Score", "Note", "RubricScore", "SubmitDate", "CheckDate"]);
    }
  }
  return { success: true };
}

function apiBulkCheckStatus(token, assignmentId, ids, status) {
  var session = apiValidateSession(token);
  if (session.role === "student") throw new Error("ไม่มีสิทธิ์ตรวจงาน");
  
  var now = new Date().toISOString();
  for (var i = 0; i < ids.length; i++) {
    updateRow("AssignmentStatus", "StatusID", ids[i], {
      Status: status,
      CheckDate: now
    });
  }
  writeLog("BULK_CHECK", "อัปเดตสถานะ " + ids.length + " รายการเป็น " + status, session.userId);
  return { success: true };
}

function apiGetSubjectMatrix(token, classId, subjectId) {
  var assignments = apiListAssignments(token, classId, subjectId);
  var students = apiListStudents(token, classId);
  
  var assignIds = {};
  for (var a = 0; a < assignments.length; a++) assignIds[String(assignments[a].AssignmentID)] = true;
  
  var allStatuses = getRows("AssignmentStatus").filter(function(r) {
    return assignIds[String(r.AssignmentID)];
  });
  
  var matrix = {};
  for (var s = 0; s < students.length; s++) {
    matrix[String(students[s].StudentID)] = {};
  }
  
  for (var i = 0; i < allStatuses.length; i++) {
    var st = allStatuses[i];
    var sId = String(st.StudentID);
    var aId = String(st.AssignmentID);
    if (!matrix[sId]) matrix[sId] = {};
    matrix[sId][aId] = {
      Status: st.Status || "not_submitted",
      Score: st.Score,
      Note: st.Note || ""
    };
  }
  
  return {
    assignments: assignments,
    students: students,
    matrix: matrix
  };
}
