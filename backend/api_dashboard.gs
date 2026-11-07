/**
 * api_dashboard.gs
 * จัดการสถิติ Dashboard และ KPI
 */

function apiGetDashboardKpi(token, classId, subjectId) {
  // จำลองข้อมูล Dashboard ชั่วคราวเพื่อให้หน้าเว็บแสดงผลได้
  // ในระบบจริง จะต้องคำนวณจาก Sheet: Scores, Behaviors
  
  var kpi = {
    totalStudents: 0,
    attendanceRate: 98.5,
    assignmentSubmissionRate: 85.0,
    averageScore: 72.5
  };
  
  var students = getRows("Students");
  if (classId) {
    students = students.filter(function(s) { return String(s["Class ID"]) === String(classId); });
  }
  kpi.totalStudents = students.length;
  
  return kpi;
}

function apiGetCheckTable(token, classId, subjectId) {
  // ส่งข้อมูลตารางสรุปการเข้าเรียน/ส่งงาน
  return {
    headers: ["ชื่อ-สกุล", "งาน 1", "งาน 2", "คะแนนรวม"],
    rows: []
  };
}

function apiGetEarlyWarning(token) {
  return [];
}
