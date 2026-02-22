// ============================================================
//  script.js  –  University Records Management System
//  Navigation, CRUD for Students/Courses/Enrollments,
//  Dashboard analytics with charts, CSV export
// ============================================================

const token = localStorage.getItem('sb_token');

// Auth guard
if (!token) {
    window.location.href = '/login.html';
}

function authHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

// ══════════════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════════════

let currentPage = 'dashboard';

function navigateTo(page) {
    currentPage = page;

    // Update sidebar active state
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.page === page);
    });

    // Show/hide pages
    document.querySelectorAll('.page').forEach(p => {
        p.classList.toggle('active', p.id === `page-${page}`);
    });

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');

    // Load data for the page
    if (page === 'dashboard') loadDashboard();
    if (page === 'students') { loadStudents(); loadStudentFilters(); }
    if (page === 'courses') { loadCourses(); loadDepartments(); }
    if (page === 'enrollments') { loadEnrollments(); loadEnrollmentDropdowns(); loadSemesters(); }
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    const email = localStorage.getItem('sb_user_email') || 'User';
    document.getElementById('sidebarUserEmail').textContent = email;
    loadDashboard();
});

// ══════════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════════

async function loadDashboard() {
    try {
        const res = await fetch('/api/dashboard', { headers: authHeaders() });
        if (res.status === 401) { localStorage.clear(); window.location.href = '/login.html'; return; }
        const data = await res.json();

        document.getElementById('dashTotalStudents').textContent = data.totalStudents;
        document.getElementById('dashTotalCourses').textContent = data.totalCourses;
        document.getElementById('dashTotalEnrollments').textContent = data.totalEnrollments;
        document.getElementById('dashGPA').textContent = data.gpa;

        // Status pills
        document.getElementById('statusEnrolled').textContent = data.statusCounts.enrolled || 0;
        document.getElementById('statusCompleted').textContent = data.statusCounts.completed || 0;
        document.getElementById('statusDropped').textContent = data.statusCounts.dropped || 0;

        // Grade distribution chart
        renderBarChart('gradeChart', data.gradeDistribution, {
            'A+': '#00b894', 'A': '#00b894', 'A-': '#00cec9',
            'B+': '#0984e3', 'B': '#0984e3', 'B-': '#74b9ff',
            'C+': '#fdcb6e', 'C': '#fdcb6e', 'C-': '#ffeaa7',
            'D+': '#e17055', 'D': '#e17055', 'D-': '#fab1a0',
            'F': '#d63031'
        });

        // Course popularity chart
        renderBarChart('courseChart', data.coursePopularity, null);

        // Recent activity
        renderRecentActivity(data.recentActivity);
    } catch (err) {
        console.error('Dashboard error:', err);
    }
}

function renderBarChart(containerId, dataObj, colorMap) {
    const container = document.getElementById(containerId);
    const entries = Object.entries(dataObj || {});

    if (entries.length === 0) {
        container.innerHTML = '<p class="text-dim" style="text-align:center;padding:2rem;">No data yet</p>';
        return;
    }

    const maxVal = Math.max(...entries.map(e => e[1]), 1);
    const colors = ['#6c5ce7', '#a29bfe', '#0984e3', '#74b9ff', '#00b894', '#00cec9', '#fdcb6e', '#e17055', '#d63031', '#fab1a0', '#636e72', '#b2bec3'];

    let html = '<div class="bar-chart">';
    entries.forEach(([label, value], i) => {
        const pct = (value / maxVal) * 100;
        const color = colorMap ? (colorMap[label] || colors[i % colors.length]) : colors[i % colors.length];
        html += `
            <div class="bar-row">
                <span class="bar-label">${escapeHtml(label)}</span>
                <div class="bar-track">
                    <div class="bar-fill" style="width:${pct}%;background:${color};">
                        <span class="bar-value">${value}</span>
                    </div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function renderRecentActivity(activities) {
    const container = document.getElementById('recentActivity');
    if (!activities || activities.length === 0) {
        container.innerHTML = '<p class="text-dim">No recent activity.</p>';
        return;
    }

    let html = '';
    activities.forEach(a => {
        html += `
            <div class="activity-item">
                <div class="activity-main">
                    <strong>${escapeHtml(a.student)}</strong>
                    <span class="text-dim">→</span>
                    <span>${escapeHtml(a.course)}</span>
                </div>
                <div class="activity-meta">
                    <span class="grade-badge grade-${getGradeLetter(a.grade)}">${a.grade}</span>
                    <span class="text-dim">${a.semester}</span>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════
//  STUDENTS
// ══════════════════════════════════════════════════════════════

let stuCurrentPage = 1, stuTotalPages = 1;
let stuSearchTimeout = null;

async function loadStudents() {
    try {
        const search = document.getElementById('stuSearch').value.trim();
        const course = document.getElementById('stuCourseFilter').value;

        let url = `/api/students?page=${stuCurrentPage}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (course) url += `&course=${encodeURIComponent(course)}`;

        const res = await fetch(url, { headers: authHeaders() });
        if (res.status === 401) { localStorage.clear(); window.location.href = '/login.html'; return; }
        const data = await res.json();
        const students = data.students;
        stuTotalPages = data.totalPages || 1;

        document.getElementById('stuLoading').style.display = 'none';

        if (students.length === 0) {
            document.getElementById('stuEmpty').style.display = 'block';
            document.getElementById('stuTableWrapper').style.display = 'none';
            document.getElementById('stuPagination').style.display = 'none';
        } else {
            document.getElementById('stuEmpty').style.display = 'none';
            document.getElementById('stuTableWrapper').style.display = 'block';
            renderStudentTable(students);

            if (stuTotalPages > 1) {
                document.getElementById('stuPagination').style.display = 'flex';
                document.getElementById('stuPageInfo').textContent = `Page ${stuCurrentPage} of ${stuTotalPages}`;
                document.getElementById('stuPrevPage').disabled = stuCurrentPage <= 1;
                document.getElementById('stuNextPage').disabled = stuCurrentPage >= stuTotalPages;
            } else {
                document.getElementById('stuPagination').style.display = 'none';
            }
        }

        document.getElementById('stuCount').textContent = data.total || 0;
    } catch (err) {
        console.error('Error loading students:', err);
        document.getElementById('stuLoading').innerHTML = '<p style="color:#e74c3c;">Failed to load.</p>';
    }
}

function renderStudentTable(students) {
    const tbody = document.getElementById('stuTableBody');
    tbody.innerHTML = '';
    students.forEach(s => {
        const row = document.createElement('tr');
        row.classList.add('fade-in');
        row.innerHTML = `
            <td>#${s.id}</td>
            <td><strong>${escapeHtml(s.name)}</strong></td>
            <td>${escapeHtml(s.email)}</td>
            <td><span class="course-tag">${escapeHtml(s.course)}</span></td>
            <td>${formatDate(s.created_at)}</td>
            <td class="action-cell">
                <button class="edit-btn" onclick="openEditStudent(${s.id}, '${escapeAttr(s.name)}', '${escapeAttr(s.email)}', '${escapeAttr(s.course)}')">Edit</button>
                <button class="delete-btn" onclick="deleteStudent(${s.id})">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Add student
document.getElementById('studentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
        name: document.getElementById('stuName').value.trim(),
        email: document.getElementById('stuEmail').value.trim(),
        course: document.getElementById('stuCourse').value.trim(),
    };

    try {
        const res = await fetch('/api/students', {
            method: 'POST', headers: authHeaders(), body: JSON.stringify(body)
        });
        const result = await res.json();
        if (res.ok) {
            showMsg('stuMessage', '✅ ' + result.message, 'success');
            document.getElementById('studentForm').reset();
            loadStudents();
            loadStudentFilters();
        } else {
            showMsg('stuMessage', '❌ ' + result.error, 'error');
        }
    } catch { showMsg('stuMessage', '❌ Could not connect to server.', 'error'); }
});

// Edit student
function openEditStudent(id, name, email, course) {
    document.getElementById('editStuId').value = id;
    document.getElementById('editStuName').value = name;
    document.getElementById('editStuEmail').value = email;
    document.getElementById('editStuCourse').value = course;
    openModal('editStudentModal');
}

document.getElementById('editStudentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editStuId').value;
    const body = {
        name: document.getElementById('editStuName').value.trim(),
        email: document.getElementById('editStuEmail').value.trim(),
        course: document.getElementById('editStuCourse').value.trim(),
    };

    try {
        const res = await fetch(`/api/students/${id}`, {
            method: 'PUT', headers: authHeaders(), body: JSON.stringify(body)
        });
        const result = await res.json();
        if (res.ok) {
            showMsg('stuMessage', '✅ ' + result.message, 'success');
            closeModal('editStudentModal');
            loadStudents();
            loadStudentFilters();
        } else {
            showMsg('stuMessage', '❌ ' + result.error, 'error');
        }
    } catch { showMsg('stuMessage', '❌ Could not connect.', 'error'); }
});

// Delete student
async function deleteStudent(id) {
    if (!confirm('Delete this student? This will also remove all their enrollments.')) return;
    try {
        const res = await fetch(`/api/students/${id}`, { method: 'DELETE', headers: authHeaders() });
        const result = await res.json();
        if (res.ok) {
            showMsg('stuMessage', '🗑️ ' + result.message, 'success');
            loadStudents();
            loadStudentFilters();
        } else {
            showMsg('stuMessage', '❌ ' + result.error, 'error');
        }
    } catch { showMsg('stuMessage', '❌ Could not connect.', 'error'); }
}

// Search & filter
document.getElementById('stuSearch').addEventListener('input', () => {
    clearTimeout(stuSearchTimeout);
    stuSearchTimeout = setTimeout(() => { stuCurrentPage = 1; loadStudents(); }, 300);
});
document.getElementById('stuCourseFilter').addEventListener('change', () => {
    stuCurrentPage = 1; loadStudents();
});
function stuChangePage(delta) {
    stuCurrentPage += delta;
    if (stuCurrentPage < 1) stuCurrentPage = 1;
    if (stuCurrentPage > stuTotalPages) stuCurrentPage = stuTotalPages;
    loadStudents();
}

async function loadStudentFilters() {
    try {
        const res = await fetch('/api/stats', { headers: authHeaders() });
        if (!res.ok) return;
        const stats = await res.json();
        const select = document.getElementById('stuCourseFilter');
        const currentVal = select.value;
        select.innerHTML = '<option value="">All Programs</option>';
        stats.courses.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c; opt.textContent = c;
            select.appendChild(opt);
        });
        select.value = currentVal;
    } catch (err) { console.error('Error loading filters:', err); }
}

// ══════════════════════════════════════════════════════════════
//  COURSES
// ══════════════════════════════════════════════════════════════

let crsCurrentPage = 1, crsTotalPages = 1;
let crsSearchTimeout = null;

async function loadCourses() {
    try {
        const search = document.getElementById('crsSearch').value.trim();
        const dept = document.getElementById('crsDeptFilter').value;

        let url = `/api/courses?page=${crsCurrentPage}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (dept) url += `&department=${encodeURIComponent(dept)}`;

        const res = await fetch(url, { headers: authHeaders() });
        if (res.status === 401) { localStorage.clear(); window.location.href = '/login.html'; return; }
        const data = await res.json();
        const courses = data.courses;
        crsTotalPages = data.totalPages || 1;

        document.getElementById('crsLoading').style.display = 'none';

        if (courses.length === 0) {
            document.getElementById('crsEmpty').style.display = 'block';
            document.getElementById('crsTableWrapper').style.display = 'none';
            document.getElementById('crsPagination').style.display = 'none';
        } else {
            document.getElementById('crsEmpty').style.display = 'none';
            document.getElementById('crsTableWrapper').style.display = 'block';
            renderCourseTable(courses);

            if (crsTotalPages > 1) {
                document.getElementById('crsPagination').style.display = 'flex';
                document.getElementById('crsPageInfo').textContent = `Page ${crsCurrentPage} of ${crsTotalPages}`;
                document.getElementById('crsPrevPage').disabled = crsCurrentPage <= 1;
                document.getElementById('crsNextPage').disabled = crsCurrentPage >= crsTotalPages;
            } else {
                document.getElementById('crsPagination').style.display = 'none';
            }
        }

        document.getElementById('crsCount').textContent = data.total || 0;
    } catch (err) {
        console.error('Error loading courses:', err);
        document.getElementById('crsLoading').innerHTML = '<p style="color:#e74c3c;">Failed to load.</p>';
    }
}

function renderCourseTable(courses) {
    const tbody = document.getElementById('crsTableBody');
    tbody.innerHTML = '';
    courses.forEach(c => {
        const row = document.createElement('tr');
        row.classList.add('fade-in');
        row.innerHTML = `
            <td><span class="code-badge">${escapeHtml(c.code)}</span></td>
            <td><strong>${escapeHtml(c.name)}</strong></td>
            <td><span class="credits-badge">${c.credits} cr</span></td>
            <td><span class="dept-tag">${escapeHtml(c.department)}</span></td>
            <td>${formatDate(c.created_at)}</td>
            <td class="action-cell">
                <button class="edit-btn" onclick="openEditCourse(${c.id}, '${escapeAttr(c.code)}', '${escapeAttr(c.name)}', ${c.credits}, '${escapeAttr(c.department)}')">Edit</button>
                <button class="delete-btn" onclick="deleteCourse(${c.id})">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Add course
document.getElementById('courseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
        code: document.getElementById('crsCode').value.trim(),
        name: document.getElementById('crsName').value.trim(),
        credits: document.getElementById('crsCredits').value,
        department: document.getElementById('crsDept').value.trim(),
    };

    try {
        const res = await fetch('/api/courses', {
            method: 'POST', headers: authHeaders(), body: JSON.stringify(body)
        });
        const result = await res.json();
        if (res.ok) {
            showMsg('crsMessage', '✅ ' + result.message, 'success');
            document.getElementById('courseForm').reset();
            loadCourses();
            loadDepartments();
        } else {
            showMsg('crsMessage', '❌ ' + result.error, 'error');
        }
    } catch { showMsg('crsMessage', '❌ Could not connect to server.', 'error'); }
});

// Edit course
function openEditCourse(id, code, name, credits, dept) {
    document.getElementById('editCrsId').value = id;
    document.getElementById('editCrsCode').value = code;
    document.getElementById('editCrsName').value = name;
    document.getElementById('editCrsCredits').value = credits;
    document.getElementById('editCrsDept').value = dept;
    openModal('editCourseModal');
}

document.getElementById('editCourseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editCrsId').value;
    const body = {
        code: document.getElementById('editCrsCode').value.trim(),
        name: document.getElementById('editCrsName').value.trim(),
        credits: document.getElementById('editCrsCredits').value,
        department: document.getElementById('editCrsDept').value.trim(),
    };

    try {
        const res = await fetch(`/api/courses/${id}`, {
            method: 'PUT', headers: authHeaders(), body: JSON.stringify(body)
        });
        const result = await res.json();
        if (res.ok) {
            showMsg('crsMessage', '✅ ' + result.message, 'success');
            closeModal('editCourseModal');
            loadCourses();
            loadDepartments();
        } else {
            showMsg('crsMessage', '❌ ' + result.error, 'error');
        }
    } catch { showMsg('crsMessage', '❌ Could not connect.', 'error'); }
});

// Delete course
async function deleteCourse(id) {
    if (!confirm('Delete this course? This will also remove all related enrollments.')) return;
    try {
        const res = await fetch(`/api/courses/${id}`, { method: 'DELETE', headers: authHeaders() });
        const result = await res.json();
        if (res.ok) {
            showMsg('crsMessage', '🗑️ ' + result.message, 'success');
            loadCourses();
            loadDepartments();
        } else {
            showMsg('crsMessage', '❌ ' + result.error, 'error');
        }
    } catch { showMsg('crsMessage', '❌ Could not connect.', 'error'); }
}

// Search & filter
document.getElementById('crsSearch').addEventListener('input', () => {
    clearTimeout(crsSearchTimeout);
    crsSearchTimeout = setTimeout(() => { crsCurrentPage = 1; loadCourses(); }, 300);
});
document.getElementById('crsDeptFilter').addEventListener('change', () => {
    crsCurrentPage = 1; loadCourses();
});
function crsChangePage(delta) {
    crsCurrentPage += delta;
    if (crsCurrentPage < 1) crsCurrentPage = 1;
    if (crsCurrentPage > crsTotalPages) crsCurrentPage = crsTotalPages;
    loadCourses();
}

async function loadDepartments() {
    try {
        const res = await fetch('/api/departments', { headers: authHeaders() });
        if (!res.ok) return;
        const depts = await res.json();
        const select = document.getElementById('crsDeptFilter');
        const currentVal = select.value;
        select.innerHTML = '<option value="">All Departments</option>';
        depts.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d; opt.textContent = d;
            select.appendChild(opt);
        });
        select.value = currentVal;
    } catch (err) { console.error('Error loading departments:', err); }
}

// ══════════════════════════════════════════════════════════════
//  ENROLLMENTS
// ══════════════════════════════════════════════════════════════

let enrCurrentPage = 1, enrTotalPages = 1;
let enrSearchTimeout = null;

async function loadEnrollments() {
    try {
        const search = document.getElementById('enrSearch').value.trim();
        const semester = document.getElementById('enrSemesterFilter').value;
        const grade = document.getElementById('enrGradeFilter').value;

        let url = `/api/enrollments?page=${enrCurrentPage}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (semester) url += `&semester=${encodeURIComponent(semester)}`;
        if (grade) url += `&grade=${encodeURIComponent(grade)}`;

        const res = await fetch(url, { headers: authHeaders() });
        if (res.status === 401) { localStorage.clear(); window.location.href = '/login.html'; return; }
        const data = await res.json();
        const enrollments = data.enrollments;
        enrTotalPages = data.totalPages || 1;

        document.getElementById('enrLoading').style.display = 'none';

        if (enrollments.length === 0) {
            document.getElementById('enrEmpty').style.display = 'block';
            document.getElementById('enrTableWrapper').style.display = 'none';
            document.getElementById('enrPagination').style.display = 'none';
        } else {
            document.getElementById('enrEmpty').style.display = 'none';
            document.getElementById('enrTableWrapper').style.display = 'block';
            renderEnrollmentTable(enrollments);

            if (enrTotalPages > 1) {
                document.getElementById('enrPagination').style.display = 'flex';
                document.getElementById('enrPageInfo').textContent = `Page ${enrCurrentPage} of ${enrTotalPages}`;
                document.getElementById('enrPrevPage').disabled = enrCurrentPage <= 1;
                document.getElementById('enrNextPage').disabled = enrCurrentPage >= enrTotalPages;
            } else {
                document.getElementById('enrPagination').style.display = 'none';
            }
        }

        document.getElementById('enrCount').textContent = data.total || 0;
    } catch (err) {
        console.error('Error loading enrollments:', err);
        document.getElementById('enrLoading').innerHTML = '<p style="color:#e74c3c;">Failed to load.</p>';
    }
}

function renderEnrollmentTable(enrollments) {
    const tbody = document.getElementById('enrTableBody');
    tbody.innerHTML = '';
    enrollments.forEach(e => {
        const row = document.createElement('tr');
        row.classList.add('fade-in');
        row.innerHTML = `
            <td>
                <strong>${escapeHtml(e.student_name)}</strong>
                <div class="text-dim text-small">${escapeHtml(e.student_email)}</div>
            </td>
            <td>
                <span class="code-badge">${escapeHtml(e.course_code)}</span>
                <div class="text-small">${escapeHtml(e.course_name)}</div>
            </td>
            <td><span class="grade-badge grade-${getGradeLetter(e.grade)}">${e.grade || 'Pending'}</span></td>
            <td>${escapeHtml(e.semester)}</td>
            <td><span class="status-tag status-${e.status}">${capitalize(e.status)}</span></td>
            <td class="action-cell">
                <button class="edit-btn" onclick="openEditEnrollment(${e.id}, '${escapeAttr(e.grade || '')}', '${escapeAttr(e.status)}', '${escapeAttr(e.semester)}')">Edit</button>
                <button class="delete-btn" onclick="deleteEnrollment(${e.id})">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Add enrollment
document.getElementById('enrollForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
        student_id: document.getElementById('enrStudent').value,
        course_id: document.getElementById('enrCourse').value,
        semester: document.getElementById('enrSemester').value.trim(),
        grade: document.getElementById('enrGrade').value || null,
        status: 'enrolled'
    };

    try {
        const res = await fetch('/api/enrollments', {
            method: 'POST', headers: authHeaders(), body: JSON.stringify(body)
        });
        const result = await res.json();
        if (res.ok) {
            showMsg('enrMessage', '✅ ' + result.message, 'success');
            document.getElementById('enrollForm').reset();
            loadEnrollments();
            loadSemesters();
        } else {
            showMsg('enrMessage', '❌ ' + result.error, 'error');
        }
    } catch { showMsg('enrMessage', '❌ Could not connect to server.', 'error'); }
});

// Edit enrollment
function openEditEnrollment(id, grade, status, semester) {
    document.getElementById('editEnrId').value = id;
    document.getElementById('editEnrGrade').value = grade;
    document.getElementById('editEnrStatus').value = status;
    document.getElementById('editEnrSemester').value = semester;
    openModal('editEnrollModal');
}

document.getElementById('editEnrollForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editEnrId').value;
    const body = {
        grade: document.getElementById('editEnrGrade').value || null,
        status: document.getElementById('editEnrStatus').value,
        semester: document.getElementById('editEnrSemester').value.trim(),
    };

    try {
        const res = await fetch(`/api/enrollments/${id}`, {
            method: 'PUT', headers: authHeaders(), body: JSON.stringify(body)
        });
        const result = await res.json();
        if (res.ok) {
            showMsg('enrMessage', '✅ ' + result.message, 'success');
            closeModal('editEnrollModal');
            loadEnrollments();
            loadSemesters();
        } else {
            showMsg('enrMessage', '❌ ' + result.error, 'error');
        }
    } catch { showMsg('enrMessage', '❌ Could not connect.', 'error'); }
});

// Delete enrollment
async function deleteEnrollment(id) {
    if (!confirm('Remove this enrollment?')) return;
    try {
        const res = await fetch(`/api/enrollments/${id}`, { method: 'DELETE', headers: authHeaders() });
        const result = await res.json();
        if (res.ok) {
            showMsg('enrMessage', '🗑️ ' + result.message, 'success');
            loadEnrollments();
            loadSemesters();
        } else {
            showMsg('enrMessage', '❌ ' + result.error, 'error');
        }
    } catch { showMsg('enrMessage', '❌ Could not connect.', 'error'); }
}

// Search & filter
document.getElementById('enrSearch').addEventListener('input', () => {
    clearTimeout(enrSearchTimeout);
    enrSearchTimeout = setTimeout(() => { enrCurrentPage = 1; loadEnrollments(); }, 300);
});
document.getElementById('enrSemesterFilter').addEventListener('change', () => {
    enrCurrentPage = 1; loadEnrollments();
});
document.getElementById('enrGradeFilter').addEventListener('change', () => {
    enrCurrentPage = 1; loadEnrollments();
});
function enrChangePage(delta) {
    enrCurrentPage += delta;
    if (enrCurrentPage < 1) enrCurrentPage = 1;
    if (enrCurrentPage > enrTotalPages) enrCurrentPage = enrTotalPages;
    loadEnrollments();
}

// Load dropdowns for enrollment form
async function loadEnrollmentDropdowns() {
    try {
        // Load students
        const stuRes = await fetch('/api/students?all=true', { headers: authHeaders() });
        const stuData = await stuRes.json();
        const stuSelect = document.getElementById('enrStudent');
        stuSelect.innerHTML = '<option value="">Select Student...</option>';
        (stuData.students || []).forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = `${s.name} (${s.email})`;
            stuSelect.appendChild(opt);
        });

        // Load courses
        const crsRes = await fetch('/api/courses?all=true', { headers: authHeaders() });
        const crsData = await crsRes.json();
        const crsSelect = document.getElementById('enrCourse');
        crsSelect.innerHTML = '<option value="">Select Course...</option>';
        (crsData.courses || []).forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = `${c.code} — ${c.name} (${c.credits} cr)`;
            crsSelect.appendChild(opt);
        });
    } catch (err) { console.error('Error loading dropdowns:', err); }
}

async function loadSemesters() {
    try {
        const res = await fetch('/api/semesters', { headers: authHeaders() });
        if (!res.ok) return;
        const semesters = await res.json();
        const select = document.getElementById('enrSemesterFilter');
        const currentVal = select.value;
        select.innerHTML = '<option value="">All Semesters</option>';
        semesters.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s; opt.textContent = s;
            select.appendChild(opt);
        });
        select.value = currentVal;
    } catch (err) { console.error('Error loading semesters:', err); }
}

// ══════════════════════════════════════════════════════════════
//  CSV EXPORT
// ══════════════════════════════════════════════════════════════

function exportCSV(type) {
    const url = `/api/export/${type}`;
    // Use a temporary link to trigger download with auth
    fetch(url, { headers: authHeaders() })
        .then(res => res.blob())
        .then(blob => {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${type}_export.csv`;
            link.click();
            URL.revokeObjectURL(link.href);
        })
        .catch(err => console.error('Export error:', err));
}

// ══════════════════════════════════════════════════════════════
//  SEED / CLEAR DATABASE
// ══════════════════════════════════════════════════════════════

async function seedDatabase() {
    if (!confirm('This will load 50 students, 20 courses, and 120+ enrollments with grades into your database. Continue?')) return;

    const btn = document.querySelector('.seed-btn');
    btn.textContent = '⏳ Loading...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/seed', { method: 'POST', headers: authHeaders() });
        const result = await res.json();
        if (res.ok) {
            showMsg('dashMessage', '🌱 ' + result.message, 'success');
            loadDashboard();
        } else {
            showMsg('dashMessage', '❌ ' + result.error, 'error');
        }
    } catch {
        showMsg('dashMessage', '❌ Could not connect to server.', 'error');
    }

    btn.textContent = '🌱 Load Demo Data';
    btn.disabled = false;
}

async function clearDatabase() {
    if (!confirm('⚠️ This will DELETE ALL your students, courses, and enrollments. Are you absolutely sure?')) return;

    const btn = document.querySelector('.clear-btn');
    btn.textContent = '⏳ Clearing...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/clear', { method: 'POST', headers: authHeaders() });
        const result = await res.json();
        if (res.ok) {
            showMsg('dashMessage', '🗑️ ' + result.message, 'success');
            loadDashboard();
        } else {
            showMsg('dashMessage', '❌ ' + result.error, 'error');
        }
    } catch {
        showMsg('dashMessage', '❌ Could not connect to server.', 'error');
    }

    btn.textContent = '🗑️ Clear All Data';
    btn.disabled = false;
}

// ══════════════════════════════════════════════════════════════
//  LOGOUT
// ══════════════════════════════════════════════════════════════

async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST', headers: authHeaders() });
    } catch (err) { /* continue */ }
    localStorage.clear();
    window.location.href = '/login.html';
}

// ══════════════════════════════════════════════════════════════
//  MODALS
// ══════════════════════════════════════════════════════════════

function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });
});

// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════

function showMsg(elemId, text, type) {
    const el = document.getElementById(elemId);
    el.textContent = text;
    el.className = 'form-message ' + type;
    setTimeout(() => { el.className = 'form-message'; }, 3000);
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeAttr(text) {
    if (!text) return '';
    return text.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function getGradeLetter(grade) {
    if (!grade) return 'pending';
    const letter = grade.charAt(0).toUpperCase();
    if (letter === 'A') return 'a';
    if (letter === 'B') return 'b';
    if (letter === 'C') return 'c';
    if (letter === 'D') return 'd';
    if (letter === 'F') return 'f';
    return 'pending';
}
