/**
 * api_grades_rubrics.gs
 * จัดการการตั้งค่าคะแนน สูตรตัดเกรด รูบริก คะแนนสอบ ปพ.5 และการประเมินผล
 */

function apiGetGeneralSettings(token) {
  var def = {
    schoolName: "โรงเรียนตัวอย่างวิทยา",
    schoolLogoUrl: "",
    academicYear: "2569",
    semester: "1",
    primaryColor: "#4F46E5",
    studentPicker: true
  };
  return getSetting("GeneralSettings", def);
}

function apiSaveGeneralSettings(token, settings) {
  var session = null;
  if (token) {
    session = apiValidateSession(token);
    if (session.role !== "admin") throw new Error("เฉพาะแอดมินเท่านั้นที่แก้ไขการตั้งค่าทั่วไปได้");
  }
  
  var current = apiGetGeneralSettings(token);
  var merged = Object.assign({}, current, settings || {});
  setSetting("GeneralSettings", merged);
  if (token && session) writeLog("SAVE_SETTINGS", "บันทึกการตั้งค่าทั่วไป", session.userId);
  return { success: true };
}

function apiListScoreSettings(token) {
  var settings = getRows("ScoreSettings");
  if (!settings.length) {
    settings = [
      { SettingID: "SS1", ComponentName: "คะแนนเก็บ", FullScore: 70, Order: 1, Auto: true },
      { SettingID: "SS2", ComponentName: "สอบปลายภาค", FullScore: 30, Order: 2, Auto: false }
    ];
  }
  settings.sort(function(a, b) { return (Number(a.Order) || 0) - (Number(b.Order) || 0); });
  return settings;
}

function apiSaveScoreSetting(token, data) {
  var session = apiValidateSession(token);
  if (session.role !== "admin") throw new Error("เฉพาะแอดมินเท่านั้นที่จัดการโครงสร้างคะแนนได้");
  
  var id = data.SettingID;
  if (!id) {
    id = "SS" + new Date().getTime();
    data.SettingID = id;
    insertRow("ScoreSettings", data, ["SettingID", "ComponentName", "FullScore", "Order", "Auto"]);
  } else {
    updateRow("ScoreSettings", "SettingID", id, data);
  }
  return { success: true, SettingID: id };
}

function apiDeleteScoreSetting(token, id) {
  var session = apiValidateSession(token);
  if (session.role !== "admin") throw new Error("เฉพาะแอดมินเท่านั้นที่ลบโครงสร้างคะแนนได้");
  deleteRow("ScoreSettings", "SettingID", id);
  return { success: true };
}

function apiGetScoreFormula(token) {
  var def = { total: { collect: 70, exam: 30 } };
  return getSetting("ScoreFormula", def);
}

function apiSaveScoreFormula(token, formula) {
  var session = apiValidateSession(token);
  if (session.role !== "admin") throw new Error("เฉพาะแอดมินเท่านั้นที่บันทึกสูตรคำนวณได้");
  setSetting("ScoreFormula", formula);
  return { success: true };
}

function apiGetGradeScale(token) {
  var def = [
    { min: 80, max: 100, letter: "4", gpa: 4.0, label: "ดีเยี่ยม", color: "#10B981" },
    { min: 75, max: 79, letter: "3.5", gpa: 3.5, label: "ดีมาก", color: "#34D399" },
    { min: 70, max: 74, letter: "3", gpa: 3.0, label: "ดี", color: "#60A5FA" },
    { min: 65, max: 69, letter: "2.5", gpa: 2.5, label: "ค่อนข้างดี", color: "#818CF8" },
    { min: 60, max: 64, letter: "2", gpa: 2.0, label: "ปานกลาง", color: "#FBBF24" },
    { min: 55, max: 59, letter: "1.5", gpa: 1.5, label: "พอใช้", color: "#F59E0B" },
    { min: 50, max: 54, letter: "1", gpa: 1.0, label: "ผ่านเกณฑ์", color: "#FB923C" },
    { min: 0, max: 49, letter: "0", gpa: 0.0, label: "ต่ำกว่าเกณฑ์", color: "#EF4444" }
  ];
  return getSetting("GradeScale", def);
}

function apiSaveGradeScale(token, scale) {
  var session = apiValidateSession(token);
  if (session.role !== "admin") throw new Error("เฉพาะแอดมินเท่านั้นที่แก้ไขเกณฑ์การตัดเกรดได้");
  setSetting("GradeScale", scale);
  return { success: true };
}

function apiListRubrics(token) {
  return getRows("Rubrics");
}

function apiSaveRubric(token, rubric) {
  var session = apiValidateSession(token);
  if (session.role === "student") throw new Error("ไม่มีสิทธิ์แก้ไขรูบริก");
  
  var id = rubric.RubricID;
  if (rubric.Criteria && typeof rubric.Criteria === "object") {
    rubric.Criteria = JSON.stringify(rubric.Criteria);
  }
  
  if (!id) {
    id = "RB" + new Date().getTime();
    rubric.RubricID = id;
    insertRow("Rubrics", rubric, ["RubricID", "Name", "Description", "Criteria"]);
  } else {
    updateRow("Rubrics", "RubricID", id, rubric);
  }
  return { success: true, RubricID: id };
}

function apiDeleteRubric(token, id) {
  var session = apiValidateSession(token);
  if (session.role !== "admin") throw new Error("ไม่มีสิทธิ์ลบรูบริก");
  deleteRow("Rubrics", "RubricID", id);
  return { success: true };
}

function apiSaveRubricScore(token, statusId, rubricDraft) {
  var session = apiValidateSession(token);
  if (session.role === "student") throw new Error("ไม่มีสิทธิ์ตรวจรูบริก");
  
  var totalScore = 0;
  if (rubricDraft && rubricDraft.scores) {
    for (var k in rubricDraft.scores) totalScore += Number(rubricDraft.scores[k] || 0);
  }
  
  return apiUpdateAssignmentStatus(token, statusId, {
    RubricScore: rubricDraft,
    Score: totalScore,
    Status: "checked"
  });
}

function apiListExamScores(token, studentId, subjectId) {
  var rows = getRows("ExamScores");
  if (studentId) rows = rows.filter(function(r) { return String(r.StudentID) === String(studentId); });
  if (subjectId) rows = rows.filter(function(r) { return String(r.SubjectID) === String(subjectId); });
  return rows;
}

function apiDeleteExamScore(token, scoreId) {
  var session = apiValidateSession(token);
  if (session.role === "student") throw new Error("ไม่มีสิทธิ์ลบคะแนนสอบ");
  deleteRow("ExamScores", "ScoreID", scoreId);
  return { success: true };
}

function apiSaveScoresBulk(token, subjectId, entries) {
  var session = apiValidateSession(token);
  if (session.role === "student") throw new Error("ไม่มีสิทธิ์บันทึกคะแนน");
  if (!entries || !entries.length) return { success: true };
  
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    var existing = findRows("ExamScores", function(r) {
      return String(r.StudentID) === String(e.StudentID) &&
             String(r.SubjectID) === String(subjectId) &&
             String(r.SettingID) === String(e.SettingID);
    });
    
    if (existing.length > 0) {
      updateRow("ExamScores", "ScoreID", existing[0].ScoreID, {
        Score: e.Score,
        Timestamp: new Date().toISOString()
      });
    } else {
      insertRow("ExamScores", {
        ScoreID: "ES" + new Date().getTime() + "_" + i,
        StudentID: e.StudentID,
        SubjectID: subjectId,
        SettingID: e.SettingID,
        Score: e.Score,
        Timestamp: new Date().toISOString()
      }, ["ScoreID", "StudentID", "SubjectID", "SettingID", "Score", "Timestamp"]);
    }
  }
  return { success: true };
}

function apiSaveTermResultsBulk(token, subjectId, entries) {
  var session = apiValidateSession(token);
  if (session.role === "student") throw new Error("ไม่มีสิทธิ์บันทึกผลการเรียน");
  if (!entries || !entries.length) return { success: true };
  
  var gs = apiGetGeneralSettings(token);
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    var existing = findRows("TermResults", function(r) {
      return String(r.StudentID) === String(e.StudentID) && String(r.SubjectID) === String(subjectId);
    });
    
    var data = Object.assign({
      AcademicYear: gs.academicYear || "2569",
      Semester: gs.semester || "1",
      SubjectID: subjectId
    }, e);
    
    if (existing.length > 0) {
      updateRow("TermResults", "ResultID", existing[0].ResultID, data);
    } else {
      data.ResultID = "TR" + new Date().getTime() + "_" + i;
      insertRow("TermResults", data, ["ResultID", "StudentID", "SubjectID", "AcademicYear", "Semester", "AttendanceHours", "AttendancePercent", "CharacterScore", "ReadingScore", "FinalGrade", "GradePoint"]);
    }
  }
  return { success: true };
}

function apiGetClassGrades(token, classId, subjectId) {
  var students = apiListStudents(token, classId);
  var components = apiListScoreSettings(token);
  var gradeScale = apiGetGradeScale(token);
  
  // หางานในวิชานี้
  var assignments = apiListAssignments(token, classId, subjectId);
  var assignIds = assignments.map(function(a) { return String(a.AssignmentID); });
  
  // คะแนนการส่งงาน
  var allStatuses = getRows("AssignmentStatus").filter(function(s) {
    return assignIds.indexOf(String(s.AssignmentID)) !== -1;
  });
  
  var assignScoreByStudent = {};
  var maxAssignScore = assignments.reduce(function(sum, a) { return sum + Number(a.FullScore || 0); }, 0);
  
  for (var i = 0; i < allStatuses.length; i++) {
    var st = allStatuses[i];
    var sId = String(st.StudentID);
    var sc = Number(st.Score || 0);
    assignScoreByStudent[sId] = (assignScoreByStudent[sId] || 0) + sc;
  }
  
  // คะแนนสอบ
  var examScores = apiListExamScores(token, null, subjectId);
  var examScoreMap = {};
  for (var j = 0; j < examScores.length; j++) {
    var es = examScores[j];
    var key = String(es.StudentID) + "_" + String(es.SettingID);
    examScoreMap[key] = Number(es.Score || 0);
  }
  
  // ผลการเรียนภาคเรียน (เวลาเรียน/คุณลักษณะ)
  var termResults = getRows("TermResults").filter(function(r) {
    return String(r.SubjectID) === String(subjectId);
  });
  var termResultMap = {};
  for (var k = 0; k < termResults.length; k++) {
    termResultMap[String(termResults[k].StudentID)] = termResults[k];
  }
  
  var rows = students.map(function(s) {
    var sId = String(s.StudentID);
    var scores = {};
    var totalScore = 0;
    var breakdown = [];
    
    for (var c = 0; c < components.length; c++) {
      var comp = components[c];
      var compId = String(comp.SettingID);
      var compScore = 0;
      
      if (comp.Auto) {
        // คำนวณตามสัดส่วนงานจริง
        var rawAssign = assignScoreByStudent[sId] || 0;
        compScore = maxAssignScore > 0 ? (rawAssign / maxAssignScore) * Number(comp.FullScore || 70) : rawAssign;
      } else {
        compScore = examScoreMap[sId + "_" + compId] !== undefined ? examScoreMap[sId + "_" + compId] : 0;
      }
      
      scores[compId] = Math.round(compScore * 10) / 10;
      totalScore += compScore;
      breakdown.push({ componentId: compId, score: scores[compId], name: comp.ComponentName });
    }
    
    totalScore = Math.min(100, Math.round(totalScore * 10) / 10);
    var letter = "0";
    for (var g = 0; g < gradeScale.length; g++) {
      if (totalScore >= gradeScale[g].min) {
        letter = gradeScale[g].letter;
        break;
      }
    }
    
    var tr = termResultMap[sId] || {
      attendanceHours: 40,
      attendancePercent: 100,
      characterScore: 3,
      readingScore: 3
    };
    
    return {
      StudentID: s.StudentID,
      No: s.No,
      Title: s.Title,
      FirstName: s.FirstName,
      LastName: s.LastName,
      FullName: s.FullName,
      scores: scores,
      grade: {
        total: totalScore,
        percent: totalScore,
        letter: letter,
        breakdown: breakdown
      },
      termResult: tr
    };
  });
  
  return {
    components: components,
    rows: rows
  };
}

function apiGetPor5(token, classId, subjectId) {
  var gs = apiGetGeneralSettings(token);
  var cls = getRowById("Classes", "ClassID", classId) || { ClassName: "ม.1/1" };
  var sub = getRowById("Subjects", "SubjectID", subjectId) || { SubjectCode: "ว21101", SubjectName: "วิทยาศาสตร์ 1" };
  var teacher = getRowById("Teachers", "TeacherID", sub.TeacherID) || { FullName: "ครูผู้สอน" };
  
  var gradesData = apiGetClassGrades(token, classId, subjectId);
  var rows = gradesData.rows;
  
  var gradeDistribution = { "4": 0, "3.5": 0, "3": 0, "2.5": 0, "2": 0, "1.5": 0, "1": 0, "0": 0 };
  for (var i = 0; i < rows.length; i++) {
    var l = rows[i].grade.letter;
    if (gradeDistribution[l] !== undefined) gradeDistribution[l]++;
  }
  
  return {
    header: {
      schoolName: gs.schoolName || "โรงเรียนตัวอย่างวิทยา",
      subjectCode: sub.SubjectCode || "",
      subjectName: sub.SubjectName || "",
      className: cls.ClassName || "",
      academicYear: gs.academicYear || "2569",
      semester: gs.semester || "1",
      teacherName: teacher.FullName || ""
    },
    rows: rows,
    summary: {
      totalStudents: rows.length,
      qualityLevels: [
        { value: 3, label: "ดีเยี่ยม (3)" },
        { value: 2, label: "ดี (2)" },
        { value: 1, label: "ผ่าน (1)" },
        { value: 0, label: "ไม่ผ่าน (0)" }
      ],
      gradeDistribution: gradeDistribution
    }
  };
}
