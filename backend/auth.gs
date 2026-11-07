/**
 * auth.gs
 * จัดการการเข้าสู่ระบบ เซสชัน และสิทธิ์ผู้ใช้งาน
 * พร้อมฟังก์ชัน apiBootstrap เพื่อลด Network Round-Trips จาก 6 ครั้งเหลือ 1 ครั้ง
 */

function apiGetPublicConfig() {
  var gs = apiGetGeneralSettings();
  var pickerOn = gs.studentPicker !== false;
  var classes = [];
  if (pickerOn) {
    try {
      classes = apiGetLoginClasses().classes;
    } catch (e) {}
  }
  return {
    demoMode: false,
    studentPicker: pickerOn,
    classes: classes,
    accounts: []
  };
}

function apiBootstrap(token) {
  var session = apiValidateSession(token);
  var settings = apiGetGeneralSettings(token);
  var classes = apiGetMyClasses(token);
  var subjects = apiListSubjects(token);
  var kpi = null;
  var earlyWarning = [];
  
  if (session.role !== "student") {
    try { kpi = apiGetDashboardKpi(token); } catch (e) {}
    try { earlyWarning = apiGetEarlyWarning(token); } catch (e) {}
  }
  
  return {
    session: session,
    settings: settings,
    classes: classes,
    subjects: subjects,
    kpi: kpi,
    earlyWarning: earlyWarning
  };
}

function apiGetLoginClasses() {
  var gs = apiGetGeneralSettings();
  if (gs.studentPicker === false) {
    throw new Error("โรงเรียนปิดการเข้าระบบด้วยการเลือกชื่อ");
  }
  
  var classes = getRows("Classes");
  var students = getRows("Students");
  
  var counts = {};
  for (var i = 0; i < students.length; i++) {
    var cId = String(students[i].ClassID || "");
    counts[cId] = (counts[cId] || 0) + 1;
  }
  
  var list = classes.map(function(c) {
    return {
      ClassID: c.ClassID,
      ClassName: c.ClassName,
      count: counts[String(c.ClassID)] || 0
    };
  });
  
  return { classes: list };
}

function apiGetLoginRoster(classId) {
  var students = getRows("Students").filter(function(s) {
    return String(s.ClassID) === String(classId);
  });
  
  students.sort(function(a, b) {
    return (Number(a.No) || 999) - (Number(b.No) || 999);
  });
  
  return students.map(function(s) {
    var fullName = s.FullName || ((s.Title || "") + s.FirstName + " " + s.LastName);
    return {
      StudentID: s.StudentID,
      No: s.No,
      Title: s.Title || "",
      FirstName: s.FirstName || "",
      LastName: s.LastName || "",
      FullName: fullName
    };
  });
}

function saveSessionData(token, sessionObj) {
  var cache = CacheService.getScriptCache();
  try {
    cache.put("sess_" + token, JSON.stringify(sessionObj), 21600); // 6 ชั่วโมง
  } catch (e) {}
}

function getSessionData(token) {
  if (!token) return null;
  var cache = CacheService.getScriptCache();
  var val = cache.get("sess_" + token);
  if (val) {
    try { return JSON.parse(val); } catch (e) {}
  }
  
  var users = getRows("Users");
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    if (u.Token === token) {
      var sess = {
        token: token,
        fullName: u.FullName || u.Name || u.Username,
        role: u.Role || "teacher",
        userId: u.UserID,
        refId: u.RefID || u.UserID
      };
      saveSessionData(token, sess);
      return sess;
    }
  }
  return null;
}

function apiLogin(username, password) {
  var uname = String(username || "").trim();
  var pwd = String(password || "").trim();
  
  if (!uname || !pwd) throw new Error("กรุณากรอกชื่อผู้ใช้และรหัสผ่าน");
  
  var users = getRows("Users");
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    if (String(u.Username).toLowerCase() === uname.toLowerCase() && String(u.Password) === pwd) {
      if (u.Status === "Inactive") {
        throw new Error("บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ");
      }
      
      var token = Utilities.getUuid();
      var session = {
        token: token,
        fullName: u.FullName || u.Name || u.Username,
        role: u.Role || "teacher",
        userId: u.UserID,
        refId: u.RefID || u.UserID
      };
      
      saveSessionData(token, session);
      updateRow("Users", "UserID", u.UserID, { LastLogin: new Date().toISOString(), Token: token });
      writeLog("LOGIN_SUCCESS", "เข้าสู่ระบบสำเร็จ: " + uname, u.UserID);
      return session;
    }
  }
  
  writeLog("LOGIN_FAILED", "เข้าสู่ระบบไม่สำเร็จ: " + uname, "");
  throw new Error("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
}

function apiLoginAsStudent(studentId) {
  var sId = String(studentId || "").trim();
  var s = getRowById("Students", "StudentID", sId);
  if (!s) throw new Error("ไม่พบข้อมูลนักเรียนรหัส: " + sId);
  
  var fullName = s.FullName || ((s.Title || "") + s.FirstName + " " + s.LastName);
  var token = Utilities.getUuid();
  var session = {
    token: token,
    fullName: fullName,
    role: "student",
    userId: s.StudentID,
    refId: s.StudentID
  };
  
  saveSessionData(token, session);
  writeLog("LOGIN_STUDENT", "นักเรียนเข้าสู่ระบบ: " + fullName, s.StudentID);
  return session;
}

function apiValidateSession(token) {
  if (!token) throw new Error("SESSION_EXPIRED");
  var session = getSessionData(token);
  if (!session) {
    var err = new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
    err.code = "SESSION_EXPIRED";
    throw err;
  }
  return session;
}

function apiLogout(token) {
  if (token) {
    try { CacheService.getScriptCache().remove("sess_" + token); } catch (e) {}
    writeLog("LOGOUT", "ออกจากระบบ", "");
  }
  return { success: true };
}

function apiChangePassword(token, oldPw, newPw) {
  var session = apiValidateSession(token);
  var u = getRowById("Users", "UserID", session.userId);
  if (!u) throw new Error("ไม่พบข้อมูลผู้ใช้");
  if (String(u.Password) !== String(oldPw)) {
    throw new Error("รหัสผ่านเดิมไม่ถูกต้อง");
  }
  if (!newPw || String(newPw).length < 4) {
    throw new Error("รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร");
  }
  updateRow("Users", "UserID", session.userId, { Password: String(newPw) });
  writeLog("CHANGE_PASSWORD", "เปลี่ยนรหัสผ่านสำเร็จ", session.userId);
  return { success: true, message: "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว" };
}

function apiResetPassword(token, userId, newPw) {
  var session = apiValidateSession(token);
  if (session.role !== "admin") throw new Error("คุณไม่มีสิทธิ์รีเซ็ตรหัสผ่าน");
  if (!newPw || String(newPw).length < 4) throw new Error("รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร");
  
  var success = updateRow("Users", "UserID", userId, { Password: String(newPw) });
  if (!success) throw new Error("ไม่พบผู้ใช้งานที่ระบุ");
  writeLog("RESET_PASSWORD", "รีเซ็ตรหัสผ่านสำหรับ User: " + userId, session.userId);
  return { success: true, message: "รีเซ็ตรหัสผ่านเรียบร้อยแล้ว" };
}

function apiResetPasswordByRef(token, refId, newPw) {
  var session = apiValidateSession(token);
  if (session.role !== "admin") throw new Error("คุณไม่มีสิทธิ์รีเซ็ตรหัสผ่าน");
  
  var users = getRows("Users");
  var found = users.find(function(u) { return String(u.RefID) === String(refId); });
  if (!found) throw new Error("ไม่พบบัญชีผู้ใช้ที่เชื่อมโยงกับรหัสนี้");
  
  updateRow("Users", "UserID", found.UserID, { Password: String(newPw) });
  writeLog("RESET_PASSWORD_BY_REF", "รีเซ็ตรหัสผ่าน RefID: " + refId, session.userId);
  return { success: true, message: "รีเซ็ตรหัสผ่านเรียบร้อยแล้ว" };
}
