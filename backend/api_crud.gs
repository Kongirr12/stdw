/**
 * api_crud.gs
 * รวมฟังก์ชันจัดการข้อมูลพื้นฐาน (Create, Read, Update, Delete) สำหรับตารางต่างๆ
 */

// --- LIST API ---

function apiListStudents(token, classId) {
  var all = getRows("Students");
  if (classId) {
    return all.filter(function(s) { return String(s["Class ID"]) === String(classId); });
  }
  return all;
}

function apiListTeachers(token) {
  return getRows("Teachers");
}

function apiListClasses(token) {
  return getRows("Classes");
}

function apiListSubjects(token) {
  return getRows("Subjects");
}

function apiListAssignments(token, subjectId) {
  var all = getRows("Assignments");
  if (subjectId) {
    return all.filter(function(a) { return String(a["Subject ID"]) === String(subjectId); });
  }
  return all;
}

function apiListUsers(token) {
  return getRows("Users");
}

function apiListAcademicYears(token) {
  return getRows("AcademicYears");
}

// --- SAVE API (Create/Update) ---

function genericSave(sheetName, idColumn, idValue, data) {
  var existing = getRowById(sheetName, idColumn, idValue);
  if (existing) {
    updateRow(sheetName, idColumn, idValue, data);
    return { success: true, message: "อัปเดตข้อมูลสำเร็จ" };
  } else {
    insertRow(sheetName, data);
    return { success: true, message: "เพิ่มข้อมูลสำเร็จ" };
  }
}

function apiSaveStudent(token, studentData) {
  return genericSave("Students", "Student ID", studentData["Student ID"], studentData);
}

function apiSaveTeacher(token, teacherData) {
  return genericSave("Teachers", "Teacher ID", teacherData["Teacher ID"], teacherData);
}

function apiSaveClass(token, classData) {
  return genericSave("Classes", "Class ID", classData["Class ID"], classData);
}

function apiSaveSubject(token, subjectData) {
  return genericSave("Subjects", "Subject ID", subjectData["Subject ID"], subjectData);
}

function apiSaveAssignment(token, assignmentData) {
  // สร้าง ID ใหม่ถ้ายังไม่มี
  if (!assignmentData["Assignment ID"]) {
    assignmentData["Assignment ID"] = "A" + new Date().getTime();
  }
  return genericSave("Assignments", "Assignment ID", assignmentData["Assignment ID"], assignmentData);
}

function apiSaveUser(token, userData) {
  return genericSave("Users", "User ID", userData["User ID"], userData);
}

// --- DELETE API ---

function genericDelete(sheetName, idColumn, idValue) {
  var success = deleteRow(sheetName, idColumn, idValue);
  if (success) {
    return { success: true, message: "ลบข้อมูลสำเร็จ" };
  } else {
    throw new Error("ไม่พบข้อมูลที่ต้องการลบ");
  }
}

function apiDeleteStudent(token, id) { return genericDelete("Students", "Student ID", id); }
function apiDeleteTeacher(token, id) { return genericDelete("Teachers", "Teacher ID", id); }
function apiDeleteClass(token, id) { return genericDelete("Classes", "Class ID", id); }
function apiDeleteSubject(token, id) { return genericDelete("Subjects", "Subject ID", id); }
function apiDeleteAssignment(token, id) { return genericDelete("Assignments", "Assignment ID", id); }
function apiDeleteUser(token, id) { return genericDelete("Users", "User ID", id); }

