/**
 * setupDatabase.gs
 * ฟังก์ชันติดตั้งและอัปเกรดฐานข้อมูลแบบคลิกเดียว (One-click Setup)
 * สร้างตาราง หัวคอลัมน์ และข้อมูลเริ่มต้นครบทุกตาราง
 */

function setupDatabase() {
  var ss = getSS();
  
  var schemas = {
    "Users": ["UserID", "Username", "Password", "FullName", "Role", "RefID", "Status", "LastLogin", "Token"],
    "Students": ["StudentID", "No", "Title", "FirstName", "LastName", "FullName", "Gender", "ClassID", "ParentName", "ParentPhone", "Status"],
    "Teachers": ["TeacherID", "Title", "FirstName", "LastName", "FullName", "Email", "Phone", "Department"],
    "Classes": ["ClassID", "ClassName", "Level", "Room", "AdvisorID"],
    "Subjects": ["SubjectID", "SubjectCode", "SubjectName", "Credit", "TeacherID", "ClassIDs"],
    "Assignments": ["AssignmentID", "SubjectID", "ClassID", "SeqNo", "Title", "Description", "FullScore", "AssignDate", "DueDate", "Weight", "Type", "RubricID", "AttachLinks"],
    "AssignmentStatus": ["StatusID", "AssignmentID", "StudentID", "Status", "Score", "Note", "RubricScore", "SubmitDate", "CheckDate"],
    "Behaviors": ["BehaviorID", "StudentID", "ClassID", "TypeID", "Points", "Note", "Date", "CreatedBy"],
    "BehaviorTypes": ["TypeID", "TypeName", "Category", "DefaultPoints", "Icon"],
    "ScoreSettings": ["SettingID", "ComponentName", "FullScore", "Order", "Auto"],
    "ExamScores": ["ScoreID", "StudentID", "SubjectID", "SettingID", "Score", "Timestamp"],
    "TermResults": ["ResultID", "StudentID", "SubjectID", "AcademicYear", "Semester", "AttendanceHours", "AttendancePercent", "CharacterScore", "ReadingScore", "FinalGrade", "GradePoint"],
    "AcademicYears": ["YearID", "Year", "Semester", "IsActive", "StartDate", "EndDate"],
    "Rubrics": ["RubricID", "Name", "Description", "Criteria"],
    "Logs": ["LogID", "Timestamp", "UserID", "Action", "Details"]
  };
  
  for (var sheetName in schemas) {
    getSheet(sheetName, schemas[sheetName]);
  }
  
  // 1. Initial Settings
  setSetting("GeneralSettings", {
    schoolName: "โรงเรียนตัวอย่างวิทยา",
    schoolLogoUrl: "",
    academicYear: "2569",
    semester: "1",
    primaryColor: "#4F46E5",
    studentPicker: true
  });
  
  // 2. Initial Academic Year
  var years = getRows("AcademicYears");
  if (!years.length) {
    insertRow("AcademicYears", {
      YearID: "AY1",
      Year: "2569",
      Semester: "1",
      IsActive: true,
      StartDate: "2026-05-16",
      EndDate: "2026-10-10"
    }, schemas["AcademicYears"]);
  }
  
  // 3. Initial Users (Admin & Teacher)
  var users = getRows("Users");
  var hasAdmin = users.some(function(u) { return u.Username === "admin"; });
  if (!hasAdmin) {
    insertRow("Users", {
      UserID: "U001",
      Username: "admin",
      Password: "password1234",
      FullName: "ผู้ดูแลระบบ",
      Role: "admin",
      RefID: "",
      Status: "Active",
      LastLogin: ""
    }, schemas["Users"]);
  }
  
  var hasTeacher = users.some(function(u) { return u.Username === "somchai"; });
  if (!hasTeacher) {
    insertRow("Users", {
      UserID: "U002",
      Username: "somchai",
      Password: "password1234",
      FullName: "นายสมชาย ใจดี",
      Role: "teacher",
      RefID: "T101",
      Status: "Active",
      LastLogin: ""
    }, schemas["Users"]);
  }
  
  // 4. Initial Teacher
  var teachers = getRows("Teachers");
  if (!teachers.length) {
    insertRow("Teachers", {
      TeacherID: "T101",
      Title: "นาย",
      FirstName: "สมชาย",
      LastName: "ใจดี",
      FullName: "นายสมชาย ใจดี",
      Email: "somchai@school.ac.th",
      Phone: "081-234-5678",
      Department: "กลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี"
    }, schemas["Teachers"]);
  }
  
  // 5. Initial Class (ม.1/1)
  var classes = getRows("Classes");
  if (!classes.length) {
    insertRow("Classes", {
      ClassID: "C101",
      ClassName: "ม.1/1",
      Level: "ม.1",
      Room: "1",
      AdvisorID: "T101"
    }, schemas["Classes"]);
  }
  
  // 6. Initial Students (5 คน)
  var students = getRows("Students");
  if (!students.length) {
    var demoStudents = [
      { StudentID: "S101", No: 1, Title: "ด.ช.", FirstName: "รักดี", LastName: "มีวินัย", Gender: "ชาย", ClassID: "C101" },
      { StudentID: "S102", No: 2, Title: "ด.ช.", FirstName: "สมคิด", LastName: "จิตแจ่มใส", Gender: "ชาย", ClassID: "C101" },
      { StudentID: "S103", No: 3, Title: "ด.ญ.", FirstName: "วิภาวรรณ", LastName: "สดใส", Gender: "หญิง", ClassID: "C101" },
      { StudentID: "S104", No: 4, Title: "ด.ญ.", FirstName: "กัญญาภัค", LastName: "มั่นคง", Gender: "หญิง", ClassID: "C101" },
      { StudentID: "S105", No: 5, Title: "ด.ช.", FirstName: "ธนภัทร", LastName: "ภักดี", Gender: "ชาย", ClassID: "C101" }
    ];
    for (var s = 0; s < demoStudents.length; s++) {
      var std = demoStudents[s];
      std.FullName = std.Title + std.FirstName + " " + std.LastName;
      std.ParentName = "ผู้ปกครอง " + std.FirstName;
      std.ParentPhone = "089-000-000" + (s + 1);
      std.Status = "กำลังศึกษา";
      insertRow("Students", std, schemas["Students"]);
    }
  }
  
  // 7. Initial Subject
  var subjects = getRows("Subjects");
  if (!subjects.length) {
    insertRow("Subjects", {
      SubjectID: "SUB101",
      SubjectCode: "ว21101",
      SubjectName: "วิทยาศาสตร์ 1",
      Credit: 1.5,
      TeacherID: "T101",
      ClassIDs: "C101"
    }, schemas["Subjects"]);
  }
  
  // 8. Initial Assignment
  var assignments = getRows("Assignments");
  if (!assignments.length) {
    var asnId = "ASN101";
    insertRow("Assignments", {
      AssignmentID: asnId,
      SubjectID: "SUB101",
      ClassID: "C101",
      SeqNo: 1,
      Title: "ใบงานที่ 1: การจำแนกประเภทสิ่งมีชีวิต",
      Description: "ให้นักเรียนสรุปแผนผังความคิดการจำแนกประเภทสิ่งมีชีวิตลงในสมุด",
      FullScore: 10,
      AssignDate: "2026-11-01",
      DueDate: "2026-11-20",
      Weight: 1,
      Type: "homework",
      RubricID: "",
      AttachLinks: ""
    }, schemas["Assignments"]);
    
    provisionStatusRows(asnId, "C101");
  }
  
  // 9. Initial Behavior Types
  var bTypes = getRows("BehaviorTypes");
  if (!bTypes.length) {
    var defaultBTypes = [
      { TypeID: "BT1", TypeName: "มีจิตสาธารณะ / ช่วยเหลืองานครู", Category: "positive", DefaultPoints: 1, Icon: "volunteer_activism" },
      { TypeID: "BT2", TypeName: "ส่งงานตรงเวลาสม่ำเสมอ", Category: "positive", DefaultPoints: 1, Icon: "task_alt" },
      { TypeID: "BT3", TypeName: "เป็นผู้นำและช่วยเหลือเพื่อน", Category: "positive", DefaultPoints: 2, Icon: "stars" },
      { TypeID: "BT4", TypeName: "ขาดส่งงานเกินกำหนด", Category: "negative", DefaultPoints: -1, Icon: "warning" },
      { TypeID: "BT5", TypeName: "ไม่ตั้งใจเรียน / กวนสมาธิผู้อื่น", Category: "negative", DefaultPoints: -1, Icon: "do_not_disturb_on" }
    ];
    insertRows("BehaviorTypes", defaultBTypes, schemas["BehaviorTypes"]);
  }
  
  // 10. Initial Score Settings
  var scoreSettings = getRows("ScoreSettings");
  if (!scoreSettings.length) {
    var defaultScoreSettings = [
      { SettingID: "SS1", ComponentName: "คะแนนเก็บระหว่างเรียน", FullScore: 70, Order: 1, Auto: true },
      { SettingID: "SS2", ComponentName: "สอบปลายภาค", FullScore: 30, Order: 2, Auto: false }
    ];
    insertRows("ScoreSettings", defaultScoreSettings, schemas["ScoreSettings"]);
  }
  
  Logger.log("✅ ติดตั้งฐานข้อมูลสำเร็จเรียบร้อยแล้ว!");
  try {
    SpreadsheetApp.getUi().alert("✅ ติดตั้งฐานข้อมูลสำเร็จ!\nสร้างตารางครบทั้ง 15 ชีต และข้อมูลตัวอย่างพร้อมใช้งานทันทีครับ\n\nบัญชีเริ่มต้น:\n- แอดมิน: admin / password1234\n- ครู: somchai / password1234");
  } catch (e) {
    // รันจากหลังบ้านโดยตรง (เช่น Web trigger) อาจไม่มี UI ให้ alert
  }
  return { success: true, message: "ติดตั้งฐานข้อมูลสำเร็จ" };
}
