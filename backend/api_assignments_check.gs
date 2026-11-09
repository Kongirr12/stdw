/**
 * api_assignments_check.gs
 * จัดการงาน การเช็คงาน ตรวจการส่งงาน และเมทริกซ์ติดตามงาน
 * เพิ่มประสิทธิภาพการตรวจงานแบบ Batch Update 1 ครั้ง แทนการวนลูป
 * รองรับการอัพโหลดไฟล์งานเข้า Google Drive แยกโฟลเดอร์ตาม ชั้นเรียน -> วิชาเรียน -> ชื่องาน
 */

function ensureAssignmentStatusColumns_() {
  try {
    var sheet = getSheet("AssignmentStatus");
    var lastCol = sheet.getLastColumn() || 1;
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
    var needed = ["FileUrl", "FileName", "FileId"];
    for (var i = 0; i < needed.length; i++) {
      if (headers.indexOf(needed[i]) === -1) {
        lastCol++;
        sheet.getRange(1, lastCol).setValue(needed[i]).setFontWeight("bold").setBackground("#F3F4F6");
      }
    }
  } catch (e) {
    Logger.log("[ensureAssignmentStatusColumns_] " + e.message);
  }
}

function getOrCreateFolder_(parentFolder, folderName) {
  var cleanName = String(folderName || "ทั่วไป").trim();
  var folders = parentFolder.getFoldersByName(cleanName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return parentFolder.createFolder(cleanName);
}

function getRootDriveFolder_() {
  var ss = getSS();
  var ssFile = DriveApp.getFileById(ss.getId());
  var parents = ssFile.getParents();
  var parentFolder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  var rootName = "ระบบเช็คงานนักเรียน_ไฟล์งาน";
  return getOrCreateFolder_(parentFolder, rootName);
}

function apiListAssignments(token, classId, subjectId) {
  var session = null;
  if (token) {
    try { session = apiValidateSession(token); } catch (e) {}
  }
  
  var isStudent = session && session.role === "student";
  var studentId = isStudent ? (session.refId || session.userId) : null;
  
  if (isStudent && !classId && studentId) {
    var student = getRowById("Students", "StudentID", studentId);
    if (student && student.ClassID) {
      classId = student.ClassID;
    }
  }

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
  
  if (isStudent && studentId) {
    var statusRows = getRows("AssignmentStatus").filter(function(r) {
      return String(r.StudentID) === String(studentId);
    });
    var statusMap = {};
    for (var i = 0; i < statusRows.length; i++) {
      statusMap[String(statusRows[i].AssignmentID)] = statusRows[i];
    }
    
    return assignments.map(function(a) {
      var st = statusMap[String(a.AssignmentID)] || {};
      var copy = Object.assign({}, a);
      copy.MyStatus = st.Status || "not_submitted";
      copy.MyScore = st.Score !== undefined ? st.Score : "";
      copy.MyNote = st.Note || "";
      copy.MyFileUrl = st.FileUrl || "";
      copy.MyFileName = st.FileName || "";
      copy.MyFileId = st.FileId || "";
      copy.MySubmitDate = st.SubmitDate || "";
      return copy;
    });
  }
  
  var allStatuses = getRows("AssignmentStatus");
  var assignStatusMap = {};
  for (var j = 0; j < allStatuses.length; j++) {
    var sRow = allStatuses[j];
    var aId = String(sRow.AssignmentID);
    if (!assignStatusMap[aId]) assignStatusMap[aId] = { total: 0, submitted: 0, late: 0, not_submitted: 0 };
    assignStatusMap[aId].total++;
    var stCode = sRow.Status || "not_submitted";
    if (stCode === "submitted" || stCode === "resubmitted") assignStatusMap[aId].submitted++;
    else if (stCode === "late") assignStatusMap[aId].late++;
    else assignStatusMap[aId].not_submitted++;
  }
  
  return assignments.map(function(a) {
    var summary = assignStatusMap[String(a.AssignmentID)] || { total: 0, submitted: 0, late: 0, not_submitted: 0 };
    var copy = Object.assign({}, a);
    copy.NotSubmitted = summary.not_submitted;
    copy.SubmittedCount = summary.submitted + summary.late;
    return copy;
  });
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
        CheckDate: "",
        FileUrl: "",
        FileName: "",
        FileId: ""
      });
    }
  }
  
  if (toInsert.length > 0) {
    insertRows("AssignmentStatus", toInsert, ["StatusID", "AssignmentID", "StudentID", "Status", "Score", "Note", "RubricScore", "SubmitDate", "CheckDate", "FileUrl", "FileName", "FileId"]);
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
  
  ensureAssignmentStatusColumns_();
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
      CheckDate: st.CheckDate || "",
      FileUrl: st.FileUrl || "",
      FileName: st.FileName || "",
      FileId: st.FileId || ""
    };
  });
  
  var folderUrl = "";
  try {
    var rootFolder = getRootDriveFolder_();
    var c = getRowById("Classes", "ClassID", a.ClassID);
    var className = (c && c.ClassName) ? c.ClassName : a.ClassID;
    var classFolder = getOrCreateFolder_(rootFolder, "ชั้น " + className);
    
    var s = getRowById("Subjects", "SubjectID", a.SubjectID);
    var subjectName = (s && s.SubjectName) ? s.SubjectName : a.SubjectID;
    var subjectFolder = getOrCreateFolder_(classFolder, subjectName);
    
    var assignFolder = getOrCreateFolder_(subjectFolder, a.Title || "งาน");
    folderUrl = assignFolder.getUrl();
  } catch (driveErr) {
    Logger.log("[apiGetCheckTable] Drive folder lookup notice: " + driveErr.message);
  }
  
  return {
    assignment: a,
    rows: rows,
    folderUrl: folderUrl
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

/**
 * ปรับปรุงให้เร็วขึ้นระดับ 30x ด้วยการทำ Batch Write ครั้งเดียว
 */
function apiBulkCheckStatus(token, assignmentId, ids, status) {
  var session = apiValidateSession(token);
  if (session.role === "student") throw new Error("ไม่มีสิทธิ์ตรวจงาน");
  if (!ids || !ids.length) return { success: true };
  
  return withLock(function() {
    var sheet = getSheet("AssignmentStatus");
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow <= 1 || lastCol === 0) return { success: true };
    
    var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    var headers = data[0];
    var statusColIdx = headers.indexOf("Status");
    var checkDateColIdx = headers.indexOf("CheckDate");
    var statusIdColIdx = headers.indexOf("StatusID");
    if (statusColIdx === -1 || statusIdColIdx === -1) return { success: true };
    
    var targetIds = {};
    for (var k = 0; k < ids.length; k++) targetIds[String(ids[k])] = true;
    
    var now = new Date().toISOString();
    var modified = false;
    for (var i = 1; i < data.length; i++) {
      var sId = String(data[i][statusIdColIdx]);
      if (targetIds[sId]) {
        data[i][statusColIdx] = status;
        if (checkDateColIdx !== -1) data[i][checkDateColIdx] = now;
        modified = true;
      }
    }
    
    if (modified) {
      sheet.getRange(1, 1, data.length, headers.length).setValues(data);
      invalidateSheetCache("AssignmentStatus");
    }
    
    writeLog("BULK_CHECK", "อัปเดตสถานะแบบกลุ่ม " + ids.length + " รายการเป็น " + status, session.userId);
    return { success: true };
  });
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

/**
 * ดึงลิงก์โฟลเดอร์ Google Drive ตามชั้นเรียนและวิชา
 */
function apiGetDriveFolderUrl(token, classId, subjectId, assignmentId) {
  var session = apiValidateSession(token);
  var rootFolder = getRootDriveFolder_();
  var targetFolder = rootFolder;
  
  if (classId) {
    var c = getRowById("Classes", "ClassID", classId);
    var className = (c && c.ClassName) ? c.ClassName : classId;
    targetFolder = getOrCreateFolder_(rootFolder, "ชั้น " + className);
    
    if (subjectId) {
      var s = getRowById("Subjects", "SubjectID", subjectId);
      var subjectName = (s && s.SubjectName) ? s.SubjectName : subjectId;
      targetFolder = getOrCreateFolder_(targetFolder, subjectName);
      
      if (assignmentId) {
        var a = getRowById("Assignments", "AssignmentID", assignmentId);
        if (a && a.Title) {
          targetFolder = getOrCreateFolder_(targetFolder, a.Title);
        }
      }
    }
  }
  
  return {
    success: true,
    folderUrl: targetFolder.getUrl(),
    folderName: targetFolder.getName()
  };
}

/**
 * อัพโหลดไฟล์งานเข้า Google Drive
 * แยกโฟลเดอร์ตาม ชั้นเรียน -> วิชาเรียน -> ชื่องาน
 */
function apiUploadFile(token, payload) {
  var session = apiValidateSession(token);
  if (!payload || !payload.base64Data) {
    throw new Error("ไม่พบข้อมูลไฟล์สำหรับอัพโหลด");
  }

  var classId = payload.classId;
  var subjectId = payload.subjectId;
  var assignmentId = payload.assignmentId;
  var studentId = payload.studentId;
  if (session.role === "student") {
    studentId = session.refId || session.userId;
  }
  
  var originalFileName = String(payload.fileName || "work_file").trim();
  var mimeType = payload.mimeType || "application/octet-stream";
  var base64Data = payload.base64Data;
  
  if (base64Data.indexOf(",") !== -1) {
    var parts = base64Data.split(",");
    var m = parts[0].match(/data:([^;]+);base64/);
    if (m) mimeType = m[1];
    base64Data = parts[1];
  }
  
  var bytes = Utilities.base64Decode(base64Data);
  if (bytes.length > 15 * 1024 * 1024) {
    throw new Error("ไฟล์มีขนาดใหญ่เกินกำหนด (ไม่เกิน 15 MB)");
  }
  
  var assignmentObj = null;
  if (assignmentId) {
    assignmentObj = getRowById("Assignments", "AssignmentID", assignmentId);
    if (assignmentObj) {
      if (!classId) classId = assignmentObj.ClassID;
      if (!subjectId) subjectId = assignmentObj.SubjectID;
    }
  }
  
  var studentObj = null;
  if (studentId) {
    studentObj = getRowById("Students", "StudentID", studentId);
    if (studentObj && !classId) {
      classId = studentObj.ClassID;
    }
  }
  
  // 1. Root folder ใน Drive
  var rootFolder = getRootDriveFolder_();
  
  // 2. Class folder: "ชั้น ม.1/1"
  var className = "ทั่วไป";
  if (classId) {
    var c = getRowById("Classes", "ClassID", classId);
    if (c && c.ClassName) className = c.ClassName;
    else className = classId;
  }
  var classFolder = getOrCreateFolder_(rootFolder, "ชั้น " + className);
  
  // 3. Subject folder: "วิทยาศาสตร์ 1"
  var subjectName = "ทั่วไป";
  if (subjectId) {
    var s = getRowById("Subjects", "SubjectID", subjectId);
    if (s && s.SubjectName) subjectName = s.SubjectName;
    else subjectName = subjectId;
  }
  var subjectFolder = getOrCreateFolder_(classFolder, subjectName);
  
  // 4. Assignment folder (ถ้ามีชื่องาน)
  var targetFolder = subjectFolder;
  if (assignmentObj && assignmentObj.Title) {
    targetFolder = getOrCreateFolder_(subjectFolder, assignmentObj.Title.trim());
  }
  
  var ext = "";
  var lastDot = originalFileName.lastIndexOf(".");
  if (lastDot !== -1) {
    ext = originalFileName.substring(lastDot);
  }
  
  var finalFileName = originalFileName;
  if (studentObj) {
    var stuNo = studentObj.No ? String(studentObj.No).padStart(2, "0") : "";
    var stuName = studentObj.FullName || (studentObj.FirstName + " " + studentObj.LastName);
    var cleanOriginal = originalFileName.substring(0, lastDot !== -1 ? lastDot : originalFileName.length);
    finalFileName = (stuNo ? (stuNo + "_") : "") + stuName + "_" + (cleanOriginal || "งาน") + ext;
  }
  
  var blob = Utilities.newBlob(bytes, mimeType, finalFileName);
  var file = targetFolder.createFile(blob);
  
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (shareErr) {
    Logger.log("[apiUploadFile] setSharing notice: " + shareErr.message);
  }
  
  var fileId = file.getId();
  var fileUrl = "https://drive.google.com/file/d/" + fileId + "/view";
  var downloadUrl = "https://drive.google.com/uc?export=download&id=" + fileId;
  
  var updatedStatus = null;
  if (assignmentId && studentId) {
    ensureAssignmentStatusColumns_();
    var statusId = "ST_" + assignmentId + "_" + studentId;
    var currentSt = getRowById("AssignmentStatus", "StatusID", statusId);
    
    var newStatus = "submitted";
    if (assignmentObj && assignmentObj.DueDate) {
      var due = new Date(assignmentObj.DueDate);
      if (!isNaN(due.getTime())) {
        due.setHours(23, 59, 59, 999);
        if (new Date() > due) {
          newStatus = "late";
        }
      }
    }
    if (currentSt && (currentSt.Status === "submitted" || currentSt.Status === "late" || currentSt.Status === "resubmitted")) {
      newStatus = "resubmitted";
    }
    
    var nowIso = new Date().toISOString();
    var patch = {
      StatusID: statusId,
      AssignmentID: assignmentId,
      StudentID: studentId,
      Status: newStatus,
      SubmitDate: nowIso,
      FileUrl: fileUrl,
      FileName: finalFileName,
      FileId: fileId
    };
    
    var ok = updateRow("AssignmentStatus", "StatusID", statusId, patch);
    if (!ok) {
      insertRow("AssignmentStatus", patch, [
        "StatusID", "AssignmentID", "StudentID", "Status", "Score", "Note", "RubricScore", "SubmitDate", "CheckDate", "FileUrl", "FileName", "FileId"
      ]);
    }
    updatedStatus = newStatus;
    writeLog("SUBMIT_WORK", "นักเรียนส่งงานผ่านไฟล์: " + finalFileName, studentId);
  } else {
    writeLog("UPLOAD_FILE", "อัพโหลดไฟล์เข้า Drive: " + finalFileName, session.userId);
  }
  
  return {
    success: true,
    fileId: fileId,
    fileName: finalFileName,
    fileUrl: fileUrl,
    downloadUrl: downloadUrl,
    folderUrl: targetFolder.getUrl(),
    status: updatedStatus
  };
}
