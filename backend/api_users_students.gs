/**
 * api_users_students.gs
 * จัดการข้อมูลครู นักเรียน บัญชีผู้ใช้งาน และประวัติผลการเรียน
 */

function apiListTeachers(token) {
  var teachers = getRows("Teachers");
  return teachers.map(function(t) {
    return {
      TeacherID: t.TeacherID,
      Title: t.Title || "",
      FirstName: t.FirstName || "",
      LastName: t.LastName || "",
      FullName: t.FullName || ((t.Title || "") + t.FirstName + " " + t.LastName),
      Email: t.Email || "",
      Phone: t.Phone || "",
      Department: t.Department || ""
    };
  });
}

function apiSaveTeacher(token, teacherData) {
  var session = apiValidateSession(token);
  if (session.role !== "admin") throw new Error("เฉพาะแอดมินเท่านั้นที่จัดการข้อมูลครูได้");
  
  var id = teacherData.TeacherID;
  var fullName = teacherData.FullName || ((teacherData.Title || "") + teacherData.FirstName + " " + teacherData.LastName);
  teacherData.FullName = fullName;
  
  if (!id) {
    id = "T" + new Date().getTime();
    teacherData.TeacherID = id;
    insertRow("Teachers", teacherData, ["TeacherID", "Title", "FirstName", "LastName", "FullName", "Email", "Phone", "Department"]);
    
    // สร้างบัญชีผู้ใช้งานอัตโนมัติหากระบุ
    var userLogin = "t_" + id.toLowerCase();
    var existingUser = getRowById("Users", "Username", userLogin);
    if (!existingUser) {
      insertRow("Users", {
        UserID: "U_" + id,
        Username: userLogin,
        Password: "password1234",
        FullName: fullName,
        Role: "teacher",
        RefID: id,
        Status: "Active",
        LastLogin: ""
      }, ["UserID", "Username", "Password", "FullName", "Role", "RefID", "Status", "LastLogin"]);
    }
    writeLog("CREATE_TEACHER", "เพิ่มข้อมูลครู: " + fullName, session.userId);
  } else {
    updateRow("Teachers", "TeacherID", id, teacherData);
    writeLog("UPDATE_TEACHER", "แก้ไขข้อมูลครู: " + fullName, session.userId);
  }
  return { success: true, TeacherID: id };
}

function apiDeleteTeacher(token, id) {
  var session = apiValidateSession(token);
  if (session.role !== "admin") throw new Error("เฉพาะแอดมินเท่านั้นที่ลบข้อมูลครูได้");
  
  deleteRow("Teachers", "TeacherID", id);
  // ระงับบัญชีผู้ใช้ที่ผูกไว้
  var users = getRows("Users");
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].RefID) === String(id)) {
      updateRow("Users", "UserID", users[i].UserID, { Status: "Inactive" });
    }
  }
  writeLog("DELETE_TEACHER", "ลบครูรหัส: " + id, session.userId);
  return { success: true };
}

function apiListStudents(token, classId) {
  var students = getRows("Students");
  if (classId) {
    students = students.filter(function(s) { return String(s.ClassID) === String(classId); });
  }
  
  students.sort(function(a, b) {
    return (Number(a.No) || 999) - (Number(b.No) || 999);
  });
  
  return students.map(function(s) {
    var fullName = s.FullName || ((s.Title || "") + s.FirstName + " " + s.LastName);
    return {
      StudentID: s.StudentID,
      No: s.No || "",
      Title: s.Title || "",
      FirstName: s.FirstName || "",
      LastName: s.LastName || "",
      FullName: fullName,
      Gender: s.Gender || "ชาย",
      ClassID: s.ClassID || "",
      ParentName: s.ParentName || "",
      ParentPhone: s.ParentPhone || "",
      Status: s.Status || "กำลังศึกษา"
    };
  });
}

function apiSaveStudent(token, studentData) {
  var session = apiValidateSession(token);
  if (session.role === "student") throw new Error("ไม่มีสิทธิ์จัดการข้อมูลนักเรียน");
  
  var id = studentData.StudentID;
  var fullName = studentData.FullName || ((studentData.Title || "") + studentData.FirstName + " " + studentData.LastName);
  studentData.FullName = fullName;
  
  if (!id) {
    id = "S" + new Date().getTime();
    studentData.StudentID = id;
    insertRow("Students", studentData, ["StudentID", "No", "Title", "FirstName", "LastName", "FullName", "Gender", "ClassID", "ParentName", "ParentPhone", "Status"]);
    writeLog("CREATE_STUDENT", "เพิ่มนักเรียน: " + fullName, session.userId);
  } else {
    updateRow("Students", "StudentID", id, studentData);
    writeLog("UPDATE_STUDENT", "แก้ไขนักเรียน: " + fullName, session.userId);
  }
  return { success: true, StudentID: id };
}

function apiDeleteStudent(token, id) {
  var session = apiValidateSession(token);
  if (session.role !== "admin") throw new Error("เฉพาะแอดมินเท่านั้นที่ลบนักเรียนได้");
  
  deleteRow("Students", "StudentID", id);
  writeLog("DELETE_STUDENT", "ลบนักเรียนรหัส: " + id, session.userId);
  return { success: true };
}

function apiImportStudents(token, classId, rows) {
  var session = apiValidateSession(token);
  if (session.role === "student") throw new Error("ไม่มีสิทธิ์นำเข้านักเรียน");
  if (!rows || !rows.length) throw new Error("ไม่พบข้อมูลนักเรียนที่จะนำเข้า");
  
  var toInsert = [];
  var now = new Date().getTime();
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var sId = r.StudentID || ("S" + (now + i));
    var title = r.Title || "";
    var fName = r.FirstName || "";
    var lName = r.LastName || "";
    var full = r.FullName || ((title || "") + fName + " " + lName);
    
    toInsert.push({
      StudentID: sId,
      No: r.No || (i + 1),
      Title: title,
      FirstName: fName,
      LastName: lName,
      FullName: full,
      Gender: r.Gender || "ชาย",
      ClassID: classId || r.ClassID || "",
      ParentName: r.ParentName || "",
      ParentPhone: r.ParentPhone || "",
      Status: "กำลังศึกษา"
    });
  }
  
  insertRows("Students", toInsert, ["StudentID", "No", "Title", "FirstName", "LastName", "FullName", "Gender", "ClassID", "ParentName", "ParentPhone", "Status"]);
  writeLog("IMPORT_STUDENTS", "นำเข้านักเรียน " + toInsert.length + " คน เข้าห้อง " + classId, session.userId);
  return { success: true, count: toInsert.length };
}

function apiExportStudentsCsv(token, classId) {
  var students = apiListStudents(token, classId);
  var headers = ["StudentID", "No", "Title", "FirstName", "LastName", "Gender", "ClassID", "ParentName", "ParentPhone", "Status"];
  var lines = [headers.join(",")];
  for (var i = 0; i < students.length; i++) {
    var s = students[i];
    var line = headers.map(function(h) {
      var val = String(s[h] || "").replace(/"/g, '""');
      return /[",\r\n]/.test(val) ? '"' + val + '"' : val;
    }).join(",");
    lines.push(line);
  }
  return lines.join("\r\n");
}

function apiListUsers(token) {
  var users = getRows("Users");
  return users.map(function(u) {
    return {
      UserID: u.UserID,
      Username: u.Username,
      FullName: u.FullName || u.Name || u.Username,
      Role: u.Role,
      RefID: u.RefID || "",
      Status: u.Status || "Active",
      LastLogin: u.LastLogin || ""
    };
  });
}

function apiCreateUserAccount(token, userData) {
  var session = apiValidateSession(token);
  if (session.role !== "admin") throw new Error("เฉพาะแอดมินเท่านั้นที่สร้างผู้ใช้ได้");
  
  var uname = String(userData.Username || "").trim();
  if (!uname) throw new Error("กรุณากรอก Username");
  
  var existing = getRowById("Users", "Username", uname);
  if (existing) throw new Error("ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว");
  
  var uId = "U" + new Date().getTime();
  insertRow("Users", {
    UserID: uId,
    Username: uname,
    Password: String(userData.Password || "1234"),
    FullName: userData.FullName || uname,
    Role: userData.Role || "teacher",
    RefID: userData.RefID || "",
    Status: "Active",
    LastLogin: ""
  }, ["UserID", "Username", "Password", "FullName", "Role", "RefID", "Status", "LastLogin"]);
  
  writeLog("CREATE_USER", "สร้างผู้ใช้: " + uname, session.userId);
  return { success: true, UserID: uId };
}

function apiDeleteUser(token, userId) {
  var session = apiValidateSession(token);
  if (session.role !== "admin") throw new Error("เฉพาะแอดมินเท่านั้นที่ลบผู้ใช้ได้");
  if (session.userId === userId) throw new Error("ไม่สามารถลบบัญชีของตัวเองได้");
  
  deleteRow("Users", "UserID", userId);
  writeLog("DELETE_USER", "ลบผู้ใช้: " + userId, session.userId);
  return { success: true };
}

function apiSetUserStatus(token, userId, status) {
  var session = apiValidateSession(token);
  if (session.role !== "admin") throw new Error("เฉพาะแอดมินเท่านั้นที่เปลี่ยนสถานะผู้ใช้ได้");
  if (session.userId === userId) throw new Error("ไม่สามารถเปลี่ยนสถานะบัญชีของตัวเองได้");
  
  updateRow("Users", "UserID", userId, { Status: status });
  writeLog("SET_USER_STATUS", "เปลี่ยนสถานะผู้ใช้ " + userId + " เป็น " + status, session.userId);
  return { success: true };
}

function apiGetStudentDetail(token, studentId) {
  var s = getRowById("Students", "StudentID", studentId);
  if (!s) throw new Error("ไม่พบข้อมูลนักเรียน");
  
  var fullName = s.FullName || ((s.Title || "") + s.FirstName + " " + s.LastName);
  s.FullName = fullName;
  
  // หางานทั้งหมดของห้องเรียนนี้
  var assignments = getRows("Assignments").filter(function(a) {
    return String(a.ClassID) === String(s.ClassID);
  });
  
  var statusRows = getRows("AssignmentStatus").filter(function(r) {
    return String(r.StudentID) === String(studentId);
  });
  var statusMap = {};
  for (var i = 0; i < statusRows.length; i++) {
    statusMap[String(statusRows[i].AssignmentID)] = statusRows[i];
  }
  
  var assignmentList = assignments.map(function(a) {
    var st = statusMap[String(a.AssignmentID)] || {};
    return {
      AssignmentID: a.AssignmentID,
      SeqNo: a.SeqNo || "",
      Title: a.Title || "",
      FullScore: a.FullScore || 10,
      DueDate: a.DueDate || "",
      Status: st.Status || "not_submitted",
      Score: st.Score !== undefined && st.Score !== "" ? st.Score : "-",
      Note: st.Note || ""
    };
  });
  
  // พฤติกรรม
  var behaviors = getRows("Behaviors").filter(function(b) {
    return String(b.StudentID) === String(studentId);
  });
  var bTypes = getRows("BehaviorTypes");
  var bTypeMap = {};
  for (var j = 0; j < bTypes.length; j++) bTypeMap[String(bTypes[j].TypeID)] = bTypes[j];
  
  var behaviorList = behaviors.map(function(b) {
    var type = bTypeMap[String(b.TypeID)] || {};
    return {
      BehaviorID: b.BehaviorID,
      TypeName: type.TypeName || b.TypeID || "พฤติกรรม",
      Points: Number(b.Points || 0),
      Note: b.Note || "",
      Date: b.Date || ""
    };
  });
  
  var totalSubmitted = statusRows.filter(function(r) { return r.Status === "submitted" || r.Status === "checked"; }).length;
  var totalChecked = statusRows.filter(function(r) { return r.Status === "checked"; }).length;
  var totalMissing = statusRows.filter(function(r) { return r.Status === "not_submitted"; }).length;
  var totalStars = behaviors.reduce(function(sum, b) { return sum + Math.max(0, Number(b.Points || 0)); }, 0);
  
  return {
    student: s,
    assignments: assignmentList,
    behaviors: behaviorList,
    scores: [],
    stats: {
      totalSubmitted: totalSubmitted,
      totalChecked: totalChecked,
      totalMissing: totalMissing,
      totalStars: totalStars,
      attendanceRate: 98
    }
  };
}

function apiGetStudentAcademics(token, studentId) {
  var gs = apiGetGeneralSettings(token);
  var term = {
    semester: gs.semester || "1",
    academicYear: gs.academicYear || "2569",
    credits: 0,
    gpa: 4.0,
    subjects: []
  };
  
  var subjects = getRows("Subjects");
  var termResults = getRows("TermResults").filter(function(r) {
    return String(r.StudentID) === String(studentId);
  });
  
  var resultMap = {};
  for (var i = 0; i < termResults.length; i++) {
    resultMap[String(termResults[i].SubjectID)] = termResults[i];
  }
  
  var totalCredit = 0;
  var totalWeight = 0;
  for (var j = 0; j < subjects.length; j++) {
    var sub = subjects[j];
    var tr = resultMap[String(sub.SubjectID)] || {};
    var cr = Number(sub.Credit || 1.0);
    var letter = tr.FinalGrade || "4";
    var gp = Number(tr.GradePoint !== undefined && tr.GradePoint !== "" ? tr.GradePoint : 4.0);
    
    totalCredit += cr;
    totalWeight += (gp * cr);
    
    term.subjects.push({
      SubjectCode: sub.SubjectCode || "",
      SubjectName: sub.SubjectName || "",
      credit: cr,
      score: tr.TotalScore || 85,
      letter: letter,
      gradePoint: gp
    });
  }
  
  term.credits = totalCredit;
  term.gpa = totalCredit > 0 ? (totalWeight / totalCredit) : 4.0;
  
  return { terms: [term] };
}

function apiGetClassAcademics(token, classId) {
  var students = apiListStudents(token, classId);
  var rows = students.map(function(s) {
    var acad = apiGetStudentAcademics(token, s.StudentID);
    var t = acad.terms[0] || {};
    return {
      No: s.No,
      FullName: s.FullName,
      credits: t.credits || 0,
      gpa: t.gpa !== null ? Number(t.gpa) : null,
      gpax: t.gpa !== null ? Number(t.gpa) : null
    };
  });
  return { rows: rows };
}
