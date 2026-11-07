/**
 * api_academics.gs
 * จัดการห้องเรียน รายวิชา และปีการศึกษา
 */

function apiListClasses(token) {
  var classes = getRows("Classes");
  var students = getRows("Students");
  
  var counts = {};
  for (var i = 0; i < students.length; i++) {
    var cId = String(students[i].ClassID || "");
    counts[cId] = (counts[cId] || 0) + 1;
  }
  
  return classes.map(function(c) {
    return {
      ClassID: c.ClassID,
      ClassName: c.ClassName,
      Level: c.Level || "",
      Room: c.Room || "",
      AdvisorID: c.AdvisorID || "",
      StudentCount: counts[String(c.ClassID)] || 0
    };
  });
}

function apiGetMyClasses(token) {
  var session = apiValidateSession(token);
  var classes = apiListClasses(token);
  if (session.role === "admin") return classes;
  
  // สำหรับครู: กรองเฉพาะห้องที่ตนเป็นที่ปรึกษา หรือห้องที่มีวิชาที่ตนสอน
  var myTeacherId = session.refId;
  var mySubjects = getRows("Subjects").filter(function(s) {
    return String(s.TeacherID) === String(myTeacherId);
  });
  
  var allowedClasses = {};
  for (var i = 0; i < mySubjects.length; i++) {
    var cids = String(mySubjects[i].ClassIDs || "").split(",");
    for (var k = 0; k < cids.length; k++) {
      var cid = cids[k].trim();
      if (cid) allowedClasses[cid] = true;
    }
  }
  
  return classes.filter(function(c) {
    return String(c.AdvisorID) === String(myTeacherId) || allowedClasses[String(c.ClassID)];
  });
}

function apiSaveClass(token, classData) {
  var session = apiValidateSession(token);
  if (session.role === "student") throw new Error("ไม่มีสิทธิ์แก้ไขชั้นเรียน");
  
  var id = classData.ClassID;
  if (!id) {
    id = "CLS" + new Date().getTime();
    classData.ClassID = id;
    insertRow("Classes", classData, ["ClassID", "ClassName", "Level", "Room", "AdvisorID"]);
    writeLog("CREATE_CLASS", "สร้างห้องเรียน: " + classData.ClassName, session.userId);
  } else {
    updateRow("Classes", "ClassID", id, classData);
    writeLog("UPDATE_CLASS", "แก้ไขห้องเรียน: " + classData.ClassName, session.userId);
  }
  return { success: true, ClassID: id };
}

function apiDeleteClass(token, classId) {
  var session = apiValidateSession(token);
  if (session.role !== "admin") throw new Error("เฉพาะแอดมินเท่านั้นที่ลบชั้นเรียนได้");
  
  deleteRow("Classes", "ClassID", classId);
  writeLog("DELETE_CLASS", "ลบห้องเรียน: " + classId, session.userId);
  return { success: true };
}

function apiListSubjects(token) {
  return getRows("Subjects");
}

function apiSaveSubject(token, subjectData) {
  var session = apiValidateSession(token);
  if (session.role === "student") throw new Error("ไม่มีสิทธิ์จัดการรายวิชา");
  
  var id = subjectData.SubjectID;
  if (!id) {
    id = "SUB" + new Date().getTime();
    subjectData.SubjectID = id;
    insertRow("Subjects", subjectData, ["SubjectID", "SubjectCode", "SubjectName", "Credit", "TeacherID", "ClassIDs"]);
    writeLog("CREATE_SUBJECT", "สร้างวิชา: " + subjectData.SubjectName, session.userId);
  } else {
    updateRow("Subjects", "SubjectID", id, subjectData);
    writeLog("UPDATE_SUBJECT", "แก้ไขวิชา: " + subjectData.SubjectName, session.userId);
  }
  return { success: true, SubjectID: id };
}

function apiDeleteSubject(token, subjectId) {
  var session = apiValidateSession(token);
  if (session.role !== "admin") throw new Error("เฉพาะแอดมินเท่านั้นที่ลบรายวิชาได้");
  
  deleteRow("Subjects", "SubjectID", subjectId);
  writeLog("DELETE_SUBJECT", "ลบวิชา: " + subjectId, session.userId);
  return { success: true };
}

function apiListAcademicYears(token) {
  return getRows("AcademicYears");
}

function apiSaveAcademicYear(token, data) {
  var session = apiValidateSession(token);
  if (session.role !== "admin") throw new Error("เฉพาะแอดมินเท่านั้นที่จัดการปีการศึกษาได้");
  
  var id = data.YearID;
  if (!id) {
    id = "AY" + new Date().getTime();
    data.YearID = id;
    insertRow("AcademicYears", data, ["YearID", "Year", "Semester", "IsActive", "StartDate", "EndDate"]);
    writeLog("CREATE_YEAR", "สร้างปีการศึกษา: " + data.Year + "/" + data.Semester, session.userId);
  } else {
    updateRow("AcademicYears", "YearID", id, data);
    writeLog("UPDATE_YEAR", "แก้ไขปีการศึกษา: " + data.Year + "/" + data.Semester, session.userId);
  }
  return { success: true, YearID: id };
}

function apiDeleteAcademicYear(token, id) {
  var session = apiValidateSession(token);
  if (session.role !== "admin") throw new Error("เฉพาะแอดมินเท่านั้นที่ลบปีการศึกษาได้");
  
  deleteRow("AcademicYears", "YearID", id);
  writeLog("DELETE_YEAR", "ลบปีการศึกษา: " + id, session.userId);
  return { success: true };
}

function apiSetActiveTerm(token, id) {
  var session = apiValidateSession(token);
  if (session.role !== "admin") throw new Error("เฉพาะแอดมินเท่านั้นที่ตั้งค่าภาคเรียนปัจจุบันได้");
  
  var years = getRows("AcademicYears");
  var activeYear = null;
  for (var i = 0; i < years.length; i++) {
    var y = years[i];
    var isActive = (String(y.YearID) === String(id));
    updateRow("AcademicYears", "YearID", y.YearID, { IsActive: isActive });
    if (isActive) activeYear = y;
  }
  
  if (activeYear) {
    var gs = apiGetGeneralSettings(token);
    gs.academicYear = String(activeYear.Year);
    gs.semester = String(activeYear.Semester);
    apiSaveGeneralSettings(token, gs);
  }
  
  writeLog("SET_ACTIVE_TERM", "ตั้งภาคเรียนปัจจุบัน: " + id, session.userId);
  return { success: true };
}
