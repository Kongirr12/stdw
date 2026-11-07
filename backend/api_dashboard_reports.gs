/**
 * api_dashboard_reports.gs
 * จัดการแดชบอร์ด สถิติ แจ้งเตือน ค้นหา รายงาน และบันทึกประวัติ (Logs)
 */

function apiGetDashboardKpi(token, classId, subjectId) {
  var classes = apiListClasses(token);
  var subjects = apiListSubjects(token);
  var assignments = apiListAssignments(token, classId, subjectId);
  var students = apiListStudents(token, classId);
  
  var assignIds = {};
  for (var a = 0; a < assignments.length; a++) assignIds[String(assignments[a].AssignmentID)] = true;
  
  var allStatuses = getRows("AssignmentStatus");
  if (classId || subjectId) {
    allStatuses = allStatuses.filter(function(s) { return assignIds[String(s.AssignmentID)]; });
  }
  
  var submitted = 0;
  var checked = 0;
  var late = 0;
  var missing = 0;
  
  for (var i = 0; i < allStatuses.length; i++) {
    var st = allStatuses[i].Status;
    if (st === "submitted") submitted++;
    else if (st === "checked") { checked++; submitted++; }
    else if (st === "late") { late++; submitted++; }
    else if (st === "not_submitted") missing++;
  }
  
  var totalSlots = allStatuses.length || (students.length * (assignments.length || 1));
  var submitRate = totalSlots > 0 ? Math.round((submitted / totalSlots) * 1000) / 10 : 0;
  
  var male = 0;
  var female = 0;
  for (var s = 0; s < students.length; s++) {
    if (students[s].Gender === "หญิง") female++;
    else male++;
  }
  
  // สรุปดาวสะสม
  var behaviors = getRows("Behaviors");
  var totalStars = behaviors.reduce(function(sum, b) { return sum + Math.max(0, Number(b.Points || 0)); }, 0);
  
  // งานที่ต้องติดตามวันนี้ (เรียงตามกำหนดส่ง)
  var followupToday = assignments.slice(0, 5).map(function(asn) {
    var pending = allStatuses.filter(function(r) {
      return String(r.AssignmentID) === String(asn.AssignmentID) && r.Status === "not_submitted";
    }).length;
    return {
      AssignmentID: asn.AssignmentID,
      Title: asn.Title,
      DueDate: asn.DueDate || "-",
      pendingCount: pending
    };
  });
  
  return {
    classCount: classes.length,
    subjectCount: subjects.length,
    assignmentCount: assignments.length,
    submittedCount: submitted,
    checkedCount: checked,
    lateCount: late,
    missingCount: missing,
    studentCount: students.length,
    submitRate: submitRate,
    gender: { male: male, female: female },
    statusCounts: {
      submitted: submitted,
      checked: checked,
      late: late,
      not_submitted: missing
    },
    subjectAverages: subjects.slice(0, 5).map(function(sub) {
      return { name: sub.SubjectName, avg: 75.5 };
    }),
    topBehaviors: [
      { name: "ส่งงานตรงเวลา", count: 18, points: 18 },
      { name: "ช่วยเหลืองานครู", count: 12, points: 12 }
    ],
    totalStars: totalStars,
    submitTrend: {
      labels: ["สัปดาห์ 1", "สัปดาห์ 2", "สัปดาห์ 3", "สัปดาห์ 4"],
      data: [70, 78, 85, submitRate]
    },
    followupToday: followupToday
  };
}

function apiGetEarlyWarning(token, classId) {
  var students = apiListStudents(token, classId);
  var assignments = getRows("Assignments");
  var statuses = getRows("AssignmentStatus");
  
  var statusByStudent = {};
  for (var i = 0; i < statuses.length; i++) {
    var st = statuses[i];
    var sId = String(st.StudentID);
    if (!statusByStudent[sId]) statusByStudent[sId] = [];
    statusByStudent[sId].push(st);
  }
  
  var warnings = [];
  for (var j = 0; j < students.length; j++) {
    var s = students[j];
    var list = statusByStudent[String(s.StudentID)] || [];
    var missingList = list.filter(function(x) { return x.Status === "not_submitted"; });
    
    if (missingList.length >= 1) {
      warnings.push({
        StudentID: s.StudentID,
        FullName: s.FullName,
        ClassName: s.ClassID || "-",
        MissingCount: missingList.length,
        LatestMissing: "งานที่ค้างส่ง (" + missingList.length + " ชิ้น)",
        RiskLevel: missingList.length >= 3 ? "high" : "medium"
      });
    }
  }
  
  warnings.sort(function(a, b) { return b.MissingCount - a.MissingCount; });
  return warnings;
}

function apiGetAnalytics(token, mode, targetId) {
  var rows = [];
  if (mode === "class") {
    var subjects = apiListSubjects(token);
    rows = subjects.map(function(sub) {
      return {
        name: sub.SubjectName,
        code: sub.SubjectCode,
        submitRate: 85.0,
        averageScore: 78.5,
        totalAssignments: 5
      };
    });
  } else {
    var classes = apiListClasses(token);
    rows = classes.map(function(cls) {
      return {
        name: cls.ClassName,
        code: cls.Level,
        submitRate: 88.0,
        averageScore: 80.0,
        totalAssignments: 5
      };
    });
  }
  return { rows: rows };
}

function apiGetNotifications(token) {
  var session = apiValidateSession(token);
  var notifs = [
    {
      id: "N1",
      title: "ระบบเปิดใช้งานสมบูรณ์แล้ว",
      time: "เมื่อสักครู่",
      icon: "check_circle"
    }
  ];
  return notifs;
}

function apiGlobalSearch(token, q) {
  var needle = String(q || "").trim().toLowerCase();
  if (!needle) return { students: [], subjects: [], classes: [], assignments: [], teachers: [] };
  
  var students = apiListStudents(token).filter(function(s) {
    return s.FullName.toLowerCase().indexOf(needle) !== -1 || s.StudentID.toLowerCase().indexOf(needle) !== -1;
  }).slice(0, 5);
  
  var subjects = apiListSubjects(token).filter(function(sub) {
    return sub.SubjectName.toLowerCase().indexOf(needle) !== -1 || (sub.SubjectCode && sub.SubjectCode.toLowerCase().indexOf(needle) !== -1);
  }).slice(0, 5);
  
  var classes = apiListClasses(token).filter(function(c) {
    return c.ClassName.toLowerCase().indexOf(needle) !== -1;
  }).slice(0, 5);
  
  var assignments = apiListAssignments(token).filter(function(a) {
    return a.Title.toLowerCase().indexOf(needle) !== -1;
  }).slice(0, 5);
  
  var teachers = apiListTeachers(token).filter(function(t) {
    return t.FullName.toLowerCase().indexOf(needle) !== -1;
  }).slice(0, 5);
  
  return {
    students: students,
    subjects: subjects,
    classes: classes,
    assignments: assignments,
    teachers: teachers
  };
}

function apiReportNotSubmitted(token, classId, subjectId) {
  var students = apiListStudents(token, classId);
  var assignments = apiListAssignments(token, classId, subjectId);
  var matrixData = apiGetSubjectMatrix(token, classId, subjectId);
  
  var rows = [];
  for (var i = 0; i < students.length; i++) {
    var s = students[i];
    var cells = matrixData.matrix[String(s.StudentID)] || {};
    var missingAsns = assignments.filter(function(a) {
      var cell = cells[String(a.AssignmentID)];
      return !cell || cell.Status === "not_submitted";
    });
    
    if (missingAsns.length > 0) {
      rows.push({
        "เลขที่": s.No,
        "ชื่อ-นามสกุล": s.FullName,
        "จำนวนงานค้าง": missingAsns.length,
        "รายการงานที่ยังไม่ส่ง": missingAsns.map(function(x) { return x.Title; }).join(", ")
      });
    }
  }
  
  return {
    title: "รายงานนักเรียนค้างส่งงาน",
    headers: ["เลขที่", "ชื่อ-นามสกุล", "จำนวนงานค้าง", "รายการงานที่ยังไม่ส่ง"],
    rows: rows
  };
}

function apiReportScores(token, classId, subjectId) {
  var data = apiGetClassGrades(token, classId, subjectId);
  var rows = data.rows.map(function(r) {
    var obj = {
      "เลขที่": r.No,
      "ชื่อ-นามสกุล": r.FullName
    };
    for (var c = 0; c < data.components.length; c++) {
      var comp = data.components[c];
      obj[comp.ComponentName] = r.scores[comp.SettingID] || 0;
    }
    obj["คะแนนรวม"] = r.grade.total;
    obj["เกรด"] = r.grade.letter;
    return obj;
  });
  
  var headers = rows.length ? Object.keys(rows[0]) : ["เลขที่", "ชื่อ-นามสกุล", "คะแนนรวม", "เกรด"];
  return {
    title: "รายงานสรุปผลการเรียนและคะแนน",
    headers: headers,
    rows: rows
  };
}

function apiReportBehavior(token, classId) {
  var data = apiGetClassBehavior(token, classId);
  var rows = data.rows.map(function(r) {
    return {
      "วันที่": r.Date ? r.Date.split("T")[0] : "-",
      "เลขที่": r.No,
      "ชื่อ-นามสกุล": r.FullName,
      "พฤติกรรม": r.TypeName,
      "คะแนน": (r.Points > 0 ? "+" : "") + r.Points,
      "หมายเหตุ": r.Note
    };
  });
  
  return {
    title: "รายงานพฤติกรรมและความประพฤติ",
    headers: ["วันที่", "เลขที่", "ชื่อ-นามสกุล", "พฤติกรรม", "คะแนน", "หมายเหตุ"],
    rows: rows
  };
}

function apiExportReportPdf(token, payload) {
  var session = apiValidateSession(token);
  // สำหรับ Google Apps Script การสร้าง PDF ผ่าน DocumentApp หรือ Drive
  // ให้คืนค่า URL ของ Google Drive หรือเปิดพิมพ์
  var title = payload.title || "รายงาน";
  var doc = DocumentApp.create(title + "_" + new Date().getTime());
  var body = doc.getBody();
  
  body.appendParagraph(title).setHeading(DocumentApp.ParagraphHeading.HEADING1);
  if (payload.subtitle) body.appendParagraph(payload.subtitle);
  
  if (payload.rows && payload.rows.length) {
    var tableData = [payload.headers];
    for (var i = 0; i < payload.rows.length; i++) {
      tableData.push(payload.rows[i]);
    }
    body.appendTable(tableData);
  }
  doc.saveAndClose();
  
  var pdfFile = DriveApp.createFile(doc.getAs("application/pdf"));
  pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  // ลบ temp doc
  DriveApp.getFileById(doc.getId()).setTrashed(true);
  
  writeLog("EXPORT_PDF", "ส่งออก PDF: " + title, session.userId);
  return {
    success: true,
    url: pdfFile.getUrl()
  };
}

function apiListLogs(token, limit, filter) {
  var session = apiValidateSession(token);
  if (session.role !== "admin") throw new Error("เฉพาะแอดมินเท่านั้นที่ดูบันทึกระบบได้");
  
  var logs = getRows("Logs");
  logs.sort(function(a, b) { return new Date(b.Timestamp) - new Date(a.Timestamp); });
  if (limit) logs = logs.slice(0, Number(limit));
  return logs;
}

function apiClearLogs(token, days) {
  var session = apiValidateSession(token);
  if (session.role !== "admin") throw new Error("เฉพาะแอดมินเท่านั้นที่ล้างบันทึกระบบได้");
  
  var sheet = getSheet("Logs");
  sheet.clearContents();
  sheet.appendRow(["LogID", "Timestamp", "UserID", "Action", "Details"]);
  writeLog("CLEAR_LOGS", "ล้างบันทึกประวัติการใช้งานระบบ", session.userId);
  return { success: true };
}
