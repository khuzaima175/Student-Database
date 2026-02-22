// ============================================================
//  server.js  –  University Records Management System
//  Express backend + Supabase Auth + Cloud DB
//  Tables: students, courses, enrollments
// ============================================================

require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// ── 1. Create the Express app ────────────────────────────────
const app = express();
const PORT = 3000;

// Middleware: parse JSON bodies & serve static frontend files
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── 2. Connect to Supabase ───────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY in .env file!');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Connected to Supabase.');

// ── 3. Auth Middleware ───────────────────────────────────────
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not authenticated. Please log in.' });
    }

    const token = authHeader.split(' ')[1];

    const userSupabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: { user }, error } = await userSupabase.auth.getUser(token);

    if (error || !user) {
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    req.user = user;
    req.supabase = userSupabase;
    next();
}

// ══════════════════════════════════════════════════════════════
//  AUTH ROUTES (Public)
// ══════════════════════════════════════════════════════════════

// POST /api/auth/signup
app.post('/api/auth/signup', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
        console.error('Signup error:', error.message);
        return res.status(400).json({ error: error.message });
    }

    res.status(201).json({
        message: 'Account created successfully!',
        session: data.session
    });
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
        console.error('Login error:', error.message);
        return res.status(400).json({ error: error.message });
    }

    res.json({
        message: 'Login successful!',
        session: data.session
    });
});

// POST /api/auth/logout
app.post('/api/auth/logout', requireAuth, async (req, res) => {
    await req.supabase.auth.signOut();
    res.json({ message: 'Logged out successfully.' });
});

// ══════════════════════════════════════════════════════════════
//  STUDENT ROUTES (Protected)
// ══════════════════════════════════════════════════════════════

// GET /api/students?search=...&course=...&page=...
app.get('/api/students', requireAuth, async (req, res) => {
    const { search, course, page = 1, all } = req.query;

    // If ?all=true, return all students (for dropdowns)
    if (all === 'true') {
        const { data, error } = await req.supabase
            .from('students')
            .select('id, name, email')
            .eq('user_id', req.user.id)
            .order('name', { ascending: true });

        if (error) {
            return res.status(500).json({ error: 'Failed to fetch students.' });
        }
        return res.json({ students: data });
    }

    const pageSize = 10;
    const offset = (Number(page) - 1) * pageSize;

    let query = req.supabase
        .from('students')
        .select('*', { count: 'exact' })
        .eq('user_id', req.user.id)
        .order('id', { ascending: false });

    if (search) {
        query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    if (course) {
        query = query.eq('course', course);
    }

    query = query.range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;

    if (error) {
        console.error('Supabase error:', error.message);
        return res.status(500).json({ error: 'Failed to fetch students.' });
    }

    res.json({
        students: data,
        total: count,
        page: Number(page),
        totalPages: Math.ceil(count / pageSize)
    });
});

// POST /api/students
app.post('/api/students', requireAuth, async (req, res) => {
    const { name, email, course } = req.body;

    if (!name || !email || !course) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    const { data, error } = await req.supabase
        .from('students')
        .insert([{ name, email, course, user_id: req.user.id }])
        .select();

    if (error) {
        console.error('Supabase error:', error.message);
        return res.status(500).json({ error: 'Failed to add student.' });
    }

    res.status(201).json({
        message: 'Student added successfully!',
        student: data[0]
    });
});

// PUT /api/students/:id
app.put('/api/students/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { name, email, course } = req.body;

    if (!name || !email || !course) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    const { data: existing } = await req.supabase
        .from('students')
        .select('id')
        .eq('id', Number(id))
        .eq('user_id', req.user.id)
        .single();

    if (!existing) {
        return res.status(404).json({ error: 'Student not found.' });
    }

    const { data, error } = await req.supabase
        .from('students')
        .update({ name, email, course })
        .eq('id', Number(id))
        .eq('user_id', req.user.id)
        .select();

    if (error) {
        console.error('Supabase error:', error.message);
        return res.status(500).json({ error: 'Failed to update student.' });
    }

    res.json({ message: 'Student updated successfully!', student: data[0] });
});

// DELETE /api/students/:id
app.delete('/api/students/:id', requireAuth, async (req, res) => {
    const { id } = req.params;

    const { data: existing } = await req.supabase
        .from('students')
        .select('id')
        .eq('id', Number(id))
        .eq('user_id', req.user.id)
        .single();

    if (!existing) {
        return res.status(404).json({ error: 'Student not found.' });
    }

    const { error } = await req.supabase
        .from('students')
        .delete()
        .eq('id', Number(id))
        .eq('user_id', req.user.id);

    if (error) {
        console.error('Supabase error:', error.message);
        return res.status(500).json({ error: 'Failed to delete student.' });
    }

    res.json({ message: 'Student deleted successfully!' });
});

// ══════════════════════════════════════════════════════════════
//  COURSES ROUTES (Protected)
// ══════════════════════════════════════════════════════════════

// GET /api/courses?search=...&department=...&page=...
app.get('/api/courses', requireAuth, async (req, res) => {
    const { search, department, page = 1, all } = req.query;

    // If ?all=true, return all courses (for dropdowns)
    if (all === 'true') {
        const { data, error } = await req.supabase
            .from('courses')
            .select('id, code, name, credits')
            .eq('user_id', req.user.id)
            .order('code', { ascending: true });

        if (error) {
            return res.status(500).json({ error: 'Failed to fetch courses.' });
        }
        return res.json({ courses: data });
    }

    const pageSize = 10;
    const offset = (Number(page) - 1) * pageSize;

    let query = req.supabase
        .from('courses')
        .select('*', { count: 'exact' })
        .eq('user_id', req.user.id)
        .order('id', { ascending: false });

    if (search) {
        query = query.or(`code.ilike.%${search}%,name.ilike.%${search}%`);
    }

    if (department) {
        query = query.eq('department', department);
    }

    query = query.range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;

    if (error) {
        console.error('Supabase error:', error.message);
        return res.status(500).json({ error: 'Failed to fetch courses.' });
    }

    res.json({
        courses: data,
        total: count,
        page: Number(page),
        totalPages: Math.ceil(count / pageSize)
    });
});

// POST /api/courses
app.post('/api/courses', requireAuth, async (req, res) => {
    const { code, name, credits, department } = req.body;

    if (!code || !name || !credits || !department) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    const { data, error } = await req.supabase
        .from('courses')
        .insert([{ code, name, credits: Number(credits), department, user_id: req.user.id }])
        .select();

    if (error) {
        console.error('Supabase error:', error.message);
        return res.status(500).json({ error: 'Failed to add course.' });
    }

    res.status(201).json({
        message: 'Course added successfully!',
        course: data[0]
    });
});

// PUT /api/courses/:id
app.put('/api/courses/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { code, name, credits, department } = req.body;

    if (!code || !name || !credits || !department) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    const { data: existing } = await req.supabase
        .from('courses')
        .select('id')
        .eq('id', Number(id))
        .eq('user_id', req.user.id)
        .single();

    if (!existing) {
        return res.status(404).json({ error: 'Course not found.' });
    }

    const { data, error } = await req.supabase
        .from('courses')
        .update({ code, name, credits: Number(credits), department })
        .eq('id', Number(id))
        .eq('user_id', req.user.id)
        .select();

    if (error) {
        console.error('Supabase error:', error.message);
        return res.status(500).json({ error: 'Failed to update course.' });
    }

    res.json({ message: 'Course updated successfully!', course: data[0] });
});

// DELETE /api/courses/:id
app.delete('/api/courses/:id', requireAuth, async (req, res) => {
    const { id } = req.params;

    const { data: existing } = await req.supabase
        .from('courses')
        .select('id')
        .eq('id', Number(id))
        .eq('user_id', req.user.id)
        .single();

    if (!existing) {
        return res.status(404).json({ error: 'Course not found.' });
    }

    const { error } = await req.supabase
        .from('courses')
        .delete()
        .eq('id', Number(id))
        .eq('user_id', req.user.id);

    if (error) {
        console.error('Supabase error:', error.message);
        return res.status(500).json({ error: 'Failed to delete course.' });
    }

    res.json({ message: 'Course deleted successfully!' });
});

// GET /api/departments (unique departments for filter)
app.get('/api/departments', requireAuth, async (req, res) => {
    const { data } = await req.supabase
        .from('courses')
        .select('department')
        .eq('user_id', req.user.id);

    const unique = [...new Set((data || []).map(c => c.department))].sort();
    res.json(unique);
});

// ══════════════════════════════════════════════════════════════
//  ENROLLMENT ROUTES (Protected) — JOINs across 3 tables
// ══════════════════════════════════════════════════════════════

// GET /api/enrollments?search=...&semester=...&grade=...&page=...
app.get('/api/enrollments', requireAuth, async (req, res) => {
    const { search, semester, grade, status, page = 1 } = req.query;
    const pageSize = 10;
    const offset = (Number(page) - 1) * pageSize;

    // Use Supabase's foreign key joins to get student + course data
    let query = req.supabase
        .from('enrollments')
        .select(`
            id, grade, semester, status, enrolled_at, user_id,
            students!inner ( id, name, email ),
            courses!inner ( id, code, name, credits )
        `, { count: 'exact' })
        .eq('user_id', req.user.id)
        .order('id', { ascending: false });

    if (search) {
        query = query.or(`students.name.ilike.%${search}%,courses.code.ilike.%${search}%,courses.name.ilike.%${search}%`);
    }

    if (semester) {
        query = query.eq('semester', semester);
    }

    if (grade) {
        query = query.eq('grade', grade);
    }

    if (status) {
        query = query.eq('status', status);
    }

    query = query.range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;

    if (error) {
        console.error('Enrollment query error:', error.message);
        return res.status(500).json({ error: 'Failed to fetch enrollments.' });
    }

    // Flatten the joined data for easier frontend consumption
    const enrollments = (data || []).map(e => ({
        id: e.id,
        grade: e.grade,
        semester: e.semester,
        status: e.status,
        enrolled_at: e.enrolled_at,
        student_id: e.students.id,
        student_name: e.students.name,
        student_email: e.students.email,
        course_id: e.courses.id,
        course_code: e.courses.code,
        course_name: e.courses.name,
        course_credits: e.courses.credits
    }));

    res.json({
        enrollments,
        total: count,
        page: Number(page),
        totalPages: Math.ceil(count / pageSize)
    });
});

// POST /api/enrollments
app.post('/api/enrollments', requireAuth, async (req, res) => {
    const { student_id, course_id, semester, grade, status } = req.body;

    if (!student_id || !course_id || !semester) {
        return res.status(400).json({ error: 'Student, course, and semester are required.' });
    }

    const { data, error } = await req.supabase
        .from('enrollments')
        .insert([{
            student_id: Number(student_id),
            course_id: Number(course_id),
            semester,
            grade: grade || null,
            status: status || 'enrolled',
            user_id: req.user.id
        }])
        .select();

    if (error) {
        console.error('Enrollment insert error:', error.message);
        if (error.message.includes('duplicate') || error.message.includes('unique')) {
            return res.status(400).json({ error: 'Student is already enrolled in this course for this semester.' });
        }
        return res.status(500).json({ error: 'Failed to create enrollment.' });
    }

    res.status(201).json({
        message: 'Student enrolled successfully!',
        enrollment: data[0]
    });
});

// PUT /api/enrollments/:id
app.put('/api/enrollments/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { grade, status, semester } = req.body;

    const { data: existing } = await req.supabase
        .from('enrollments')
        .select('id')
        .eq('id', Number(id))
        .eq('user_id', req.user.id)
        .single();

    if (!existing) {
        return res.status(404).json({ error: 'Enrollment not found.' });
    }

    const updates = {};
    if (grade !== undefined) updates.grade = grade || null;
    if (status) updates.status = status;
    if (semester) updates.semester = semester;

    const { data, error } = await req.supabase
        .from('enrollments')
        .update(updates)
        .eq('id', Number(id))
        .eq('user_id', req.user.id)
        .select();

    if (error) {
        console.error('Enrollment update error:', error.message);
        return res.status(500).json({ error: 'Failed to update enrollment.' });
    }

    res.json({ message: 'Enrollment updated successfully!', enrollment: data[0] });
});

// DELETE /api/enrollments/:id
app.delete('/api/enrollments/:id', requireAuth, async (req, res) => {
    const { id } = req.params;

    const { data: existing } = await req.supabase
        .from('enrollments')
        .select('id')
        .eq('id', Number(id))
        .eq('user_id', req.user.id)
        .single();

    if (!existing) {
        return res.status(404).json({ error: 'Enrollment not found.' });
    }

    const { error } = await req.supabase
        .from('enrollments')
        .delete()
        .eq('id', Number(id))
        .eq('user_id', req.user.id);

    if (error) {
        console.error('Enrollment delete error:', error.message);
        return res.status(500).json({ error: 'Failed to delete enrollment.' });
    }

    res.json({ message: 'Enrollment deleted successfully!' });
});

// GET /api/semesters (unique semesters for filter)
app.get('/api/semesters', requireAuth, async (req, res) => {
    const { data } = await req.supabase
        .from('enrollments')
        .select('semester')
        .eq('user_id', req.user.id);

    const unique = [...new Set((data || []).map(e => e.semester))].sort();
    res.json(unique);
});

// ══════════════════════════════════════════════════════════════
//  DASHBOARD / ANALYTICS (Protected) — Aggregations & JOINs
// ══════════════════════════════════════════════════════════════

app.get('/api/dashboard', requireAuth, async (req, res) => {
    try {
        // 1. Total students
        const { count: totalStudents } = await req.supabase
            .from('students')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', req.user.id);

        // 2. Total courses
        const { count: totalCourses } = await req.supabase
            .from('courses')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', req.user.id);

        // 3. Total enrollments
        const { count: totalEnrollments } = await req.supabase
            .from('enrollments')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', req.user.id);

        // 4. All enrollments with grades for GPA calculation
        const { data: allEnrollments } = await req.supabase
            .from('enrollments')
            .select('grade, status, courses!inner(credits)')
            .eq('user_id', req.user.id);

        // GPA scale
        const gradePoints = {
            'A+': 4.0, 'A': 4.0, 'A-': 3.7,
            'B+': 3.3, 'B': 3.0, 'B-': 2.7,
            'C+': 2.3, 'C': 2.0, 'C-': 1.7,
            'D+': 1.3, 'D': 1.0, 'D-': 0.7,
            'F': 0.0
        };

        // Calculate overall GPA (weighted by credits)
        let totalCredits = 0;
        let totalGradePoints = 0;
        const gradeDistribution = {};

        (allEnrollments || []).forEach(e => {
            if (e.grade && gradePoints[e.grade] !== undefined) {
                const credits = e.courses?.credits || 3;
                totalCredits += credits;
                totalGradePoints += gradePoints[e.grade] * credits;

                // Count grade distribution
                gradeDistribution[e.grade] = (gradeDistribution[e.grade] || 0) + 1;
            }
        });

        const gpa = totalCredits > 0 ? (totalGradePoints / totalCredits).toFixed(2) : '—';

        // 5. Course popularity (enrollments per course)
        const { data: courseEnrollments } = await req.supabase
            .from('enrollments')
            .select('courses!inner(code, name)')
            .eq('user_id', req.user.id);

        const coursePopularity = {};
        (courseEnrollments || []).forEach(e => {
            const key = e.courses.code;
            coursePopularity[key] = (coursePopularity[key] || 0) + 1;
        });

        // 6. Department breakdown
        const { data: allCourses } = await req.supabase
            .from('courses')
            .select('department')
            .eq('user_id', req.user.id);

        const departmentCounts = {};
        (allCourses || []).forEach(c => {
            departmentCounts[c.department] = (departmentCounts[c.department] || 0) + 1;
        });

        // 7. Recent activity (latest 5 enrollments)
        const { data: recentEnrollments } = await req.supabase
            .from('enrollments')
            .select('id, grade, semester, enrolled_at, students!inner(name), courses!inner(code, name)')
            .eq('user_id', req.user.id)
            .order('enrolled_at', { ascending: false })
            .limit(5);

        const recentActivity = (recentEnrollments || []).map(e => ({
            student: e.students.name,
            course: `${e.courses.code} — ${e.courses.name}`,
            grade: e.grade || 'Pending',
            semester: e.semester,
            date: e.enrolled_at
        }));

        // 8. Status breakdown
        const statusCounts = { enrolled: 0, completed: 0, dropped: 0 };
        (allEnrollments || []).forEach(e => {
            if (statusCounts[e.status] !== undefined) {
                statusCounts[e.status]++;
            }
        });

        res.json({
            totalStudents: totalStudents || 0,
            totalCourses: totalCourses || 0,
            totalEnrollments: totalEnrollments || 0,
            gpa,
            gradeDistribution,
            coursePopularity,
            departmentCounts,
            statusCounts,
            recentActivity
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.status(500).json({ error: 'Failed to load dashboard data.' });
    }
});

// ══════════════════════════════════════════════════════════════
//  EXPORT ROUTES (Protected) — CSV Download
// ══════════════════════════════════════════════════════════════

app.get('/api/export/students', requireAuth, async (req, res) => {
    const { data } = await req.supabase
        .from('students')
        .select('id, name, email, course, created_at')
        .eq('user_id', req.user.id)
        .order('id', { ascending: true });

    const rows = data || [];
    const csv = [
        'ID,Name,Email,Course,Created At',
        ...rows.map(r => `${r.id},"${r.name}","${r.email}","${r.course}","${r.created_at}"`)
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="students_export.csv"');
    res.send(csv);
});

app.get('/api/export/enrollments', requireAuth, async (req, res) => {
    const { data } = await req.supabase
        .from('enrollments')
        .select('id, grade, semester, status, enrolled_at, students!inner(name, email), courses!inner(code, name, credits)')
        .eq('user_id', req.user.id)
        .order('id', { ascending: true });

    const rows = data || [];
    const csv = [
        'ID,Student Name,Student Email,Course Code,Course Name,Credits,Grade,Semester,Status,Enrolled At',
        ...rows.map(r =>
            `${r.id},"${r.students.name}","${r.students.email}","${r.courses.code}","${r.courses.name}",${r.courses.credits},"${r.grade || ''}","${r.semester}","${r.status}","${r.enrolled_at}"`
        )
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="enrollments_export.csv"');
    res.send(csv);
});

// ══════════════════════════════════════════════════════════════
//  LEGACY STATS (kept for backward compatibility)
// ══════════════════════════════════════════════════════════════

app.get('/api/stats', requireAuth, async (req, res) => {
    const { count: total } = await req.supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', req.user.id);

    const { data: allStudents } = await req.supabase
        .from('students')
        .select('course')
        .eq('user_id', req.user.id);

    const courseCounts = {};
    if (allStudents) {
        allStudents.forEach(s => {
            courseCounts[s.course] = (courseCounts[s.course] || 0) + 1;
        });
    }

    const { data: recent } = await req.supabase
        .from('students')
        .select('*')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false })
        .limit(5);

    res.json({
        total: total || 0,
        courseCounts,
        courses: Object.keys(courseCounts),
        recent: recent || []
    });
});

// ══════════════════════════════════════════════════════════════
//  SEED DATA — Pre-populate the database with realistic data
// ══════════════════════════════════════════════════════════════

app.post('/api/seed', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;

        // ── Check if already seeded ──
        const { count: existingStudents } = await req.supabase
            .from('students')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        if (existingStudents > 10) {
            return res.status(400).json({ error: 'Database already has data. Clear it first or use the existing data.' });
        }

        console.log('🌱 Seeding database for user:', req.user.email);

        // ── 1. INSERT 50 STUDENTS ────────────────────────────
        const students = [
            { name: 'Ahmed Khan', email: 'ahmed.khan@university.edu', course: 'Computer Science' },
            { name: 'Fatima Ali', email: 'fatima.ali@university.edu', course: 'Computer Science' },
            { name: 'Muhammad Hassan', email: 'm.hassan@university.edu', course: 'Software Engineering' },
            { name: 'Ayesha Siddiqui', email: 'ayesha.s@university.edu', course: 'Data Science' },
            { name: 'Omar Farooq', email: 'omar.f@university.edu', course: 'Computer Science' },
            { name: 'Zainab Malik', email: 'zainab.m@university.edu', course: 'Information Technology' },
            { name: 'Ali Raza', email: 'ali.raza@university.edu', course: 'Software Engineering' },
            { name: 'Hira Nawaz', email: 'hira.n@university.edu', course: 'Computer Science' },
            { name: 'Bilal Ahmed', email: 'bilal.a@university.edu', course: 'Electrical Engineering' },
            { name: 'Sana Sheikh', email: 'sana.s@university.edu', course: 'Data Science' },
            { name: 'Usman Tariq', email: 'usman.t@university.edu', course: 'Computer Science' },
            { name: 'Maryam Javed', email: 'maryam.j@university.edu', course: 'Business Administration' },
            { name: 'Hamza Iqbal', email: 'hamza.i@university.edu', course: 'Software Engineering' },
            { name: 'Nadia Hussain', email: 'nadia.h@university.edu', course: 'Computer Science' },
            { name: 'Saad Mehmood', email: 'saad.m@university.edu', course: 'Electrical Engineering' },
            { name: 'Rabia Aslam', email: 'rabia.a@university.edu', course: 'Data Science' },
            { name: 'Faisal Shahzad', email: 'faisal.s@university.edu', course: 'Computer Science' },
            { name: 'Amina Yousuf', email: 'amina.y@university.edu', course: 'Information Technology' },
            { name: 'Tahir Abbas', email: 'tahir.a@university.edu', course: 'Software Engineering' },
            { name: 'Khadija Riaz', email: 'khadija.r@university.edu', course: 'Business Administration' },
            { name: 'Imran Haider', email: 'imran.h@university.edu', course: 'Computer Science' },
            { name: 'Sara Akram', email: 'sara.a@university.edu', course: 'Data Science' },
            { name: 'Junaid Akhtar', email: 'junaid.a@university.edu', course: 'Electrical Engineering' },
            { name: 'Maham Zafar', email: 'maham.z@university.edu', course: 'Software Engineering' },
            { name: 'Rizwan Qureshi', email: 'rizwan.q@university.edu', course: 'Computer Science' },
            { name: 'Anum Batool', email: 'anum.b@university.edu', course: 'Information Technology' },
            { name: 'Danish Saleem', email: 'danish.s@university.edu', course: 'Computer Science' },
            { name: 'Laiba Anwar', email: 'laiba.a@university.edu', course: 'Business Administration' },
            { name: 'Waqas Aziz', email: 'waqas.a@university.edu', course: 'Software Engineering' },
            { name: 'Maheen Rehman', email: 'maheen.r@university.edu', course: 'Data Science' },
            { name: 'Adeel Shah', email: 'adeel.s@university.edu', course: 'Electrical Engineering' },
            { name: 'Nimra Khalid', email: 'nimra.k@university.edu', course: 'Computer Science' },
            { name: 'Zubair Nadeem', email: 'zubair.n@university.edu', course: 'Software Engineering' },
            { name: 'Iqra Pervez', email: 'iqra.p@university.edu', course: 'Information Technology' },
            { name: 'Kamran Ashraf', email: 'kamran.a@university.edu', course: 'Computer Science' },
            { name: 'Bushra Jamil', email: 'bushra.j@university.edu', course: 'Data Science' },
            { name: 'Naveed Ansar', email: 'naveed.a@university.edu', course: 'Electrical Engineering' },
            { name: 'Sobia Arif', email: 'sobia.a@university.edu', course: 'Business Administration' },
            { name: 'Arslan Butt', email: 'arslan.b@university.edu', course: 'Software Engineering' },
            { name: 'Sumaya Noor', email: 'sumaya.n@university.edu', course: 'Computer Science' },
            { name: 'Kashif Rafiq', email: 'kashif.r@university.edu', course: 'Information Technology' },
            { name: 'Alina Waheed', email: 'alina.w@university.edu', course: 'Data Science' },
            { name: 'Shoaib Mushtaq', email: 'shoaib.m@university.edu', course: 'Electrical Engineering' },
            { name: 'Noor Fatima', email: 'noor.f@university.edu', course: 'Computer Science' },
            { name: 'Taimoor Ghani', email: 'taimoor.g@university.edu', course: 'Software Engineering' },
            { name: 'Areeba Saeed', email: 'areeba.s@university.edu', course: 'Business Administration' },
            { name: 'Farhan Latif', email: 'farhan.l@university.edu', course: 'Computer Science' },
            { name: 'Mehwish Zahoor', email: 'mehwish.z@university.edu', course: 'Data Science' },
            { name: 'Asad Mirza', email: 'asad.m@university.edu', course: 'Electrical Engineering' },
            { name: 'Huma Nasir', email: 'huma.n@university.edu', course: 'Information Technology' },
        ].map(s => ({ ...s, user_id: userId }));

        const { data: insertedStudents, error: stuErr } = await req.supabase
            .from('students')
            .insert(students)
            .select('id, name');

        if (stuErr) {
            console.error('Student seed error:', stuErr.message);
            return res.status(500).json({ error: 'Failed to seed students: ' + stuErr.message });
        }

        // ── 2. INSERT 20 COURSES ─────────────────────────────
        const courses = [
            { code: 'CS101', name: 'Introduction to Programming', credits: 3, department: 'Computer Science' },
            { code: 'CS201', name: 'Data Structures & Algorithms', credits: 4, department: 'Computer Science' },
            { code: 'CS301', name: 'Database Systems', credits: 3, department: 'Computer Science' },
            { code: 'CS401', name: 'Operating Systems', credits: 3, department: 'Computer Science' },
            { code: 'CS402', name: 'Artificial Intelligence', credits: 3, department: 'Computer Science' },
            { code: 'SE201', name: 'Software Design Patterns', credits: 3, department: 'Software Engineering' },
            { code: 'SE301', name: 'Software Project Management', credits: 3, department: 'Software Engineering' },
            { code: 'SE401', name: 'DevOps & Cloud Computing', credits: 3, department: 'Software Engineering' },
            { code: 'DS201', name: 'Statistics for Data Science', credits: 3, department: 'Data Science' },
            { code: 'DS301', name: 'Machine Learning', credits: 4, department: 'Data Science' },
            { code: 'DS401', name: 'Deep Learning & Neural Networks', credits: 3, department: 'Data Science' },
            { code: 'EE101', name: 'Circuit Analysis', credits: 4, department: 'Electrical Engineering' },
            { code: 'EE201', name: 'Digital Logic Design', credits: 3, department: 'Electrical Engineering' },
            { code: 'EE301', name: 'Signals & Systems', credits: 3, department: 'Electrical Engineering' },
            { code: 'IT201', name: 'Web Technologies', credits: 3, department: 'Information Technology' },
            { code: 'IT301', name: 'Network Security', credits: 3, department: 'Information Technology' },
            { code: 'IT401', name: 'Cloud Infrastructure', credits: 3, department: 'Information Technology' },
            { code: 'BA201', name: 'Principles of Marketing', credits: 3, department: 'Business Administration' },
            { code: 'BA301', name: 'Financial Accounting', credits: 3, department: 'Business Administration' },
            { code: 'BA401', name: 'Business Analytics', credits: 3, department: 'Business Administration' },
        ].map(c => ({ ...c, user_id: userId }));

        const { data: insertedCourses, error: crsErr } = await req.supabase
            .from('courses')
            .insert(courses)
            .select('id, code');

        if (crsErr) {
            console.error('Course seed error:', crsErr.message);
            return res.status(500).json({ error: 'Failed to seed courses: ' + crsErr.message });
        }

        // ── 3. INSERT 120+ ENROLLMENTS (with realistic grades) ──
        const grades = ['A+', 'A', 'A', 'A-', 'B+', 'B+', 'B', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F', null, null];
        const semesters = ['Fall 2024', 'Spring 2025', 'Fall 2025', 'Spring 2026'];
        const statuses = ['completed', 'completed', 'completed', 'enrolled', 'enrolled'];

        const enrollments = [];
        const usedPairs = new Set();

        // Each student gets 2-4 course enrollments
        for (const student of insertedStudents) {
            const numCourses = 2 + Math.floor(Math.random() * 3); // 2-4 courses
            const shuffledCourses = [...insertedCourses].sort(() => Math.random() - 0.5);

            for (let i = 0; i < numCourses && i < shuffledCourses.length; i++) {
                const course = shuffledCourses[i];
                const semester = semesters[Math.floor(Math.random() * semesters.length)];
                const pairKey = `${student.id}-${course.id}-${semester}`;

                if (usedPairs.has(pairKey)) continue;
                usedPairs.add(pairKey);

                const status = statuses[Math.floor(Math.random() * statuses.length)];
                const grade = status === 'completed'
                    ? grades[Math.floor(Math.random() * (grades.length - 2))] // completed = has grade
                    : (Math.random() > 0.7 ? grades[Math.floor(Math.random() * grades.length)] : null); // enrolled = maybe has grade

                enrollments.push({
                    student_id: student.id,
                    course_id: course.id,
                    semester,
                    grade,
                    status,
                    user_id: userId
                });
            }
        }

        const { error: enrErr } = await req.supabase
            .from('enrollments')
            .insert(enrollments);

        if (enrErr) {
            console.error('Enrollment seed error:', enrErr.message);
            return res.status(500).json({ error: 'Failed to seed enrollments: ' + enrErr.message });
        }

        console.log(`🌱 Seeded: ${insertedStudents.length} students, ${insertedCourses.length} courses, ${enrollments.length} enrollments`);

        res.json({
            message: `Database seeded! Added ${insertedStudents.length} students, ${insertedCourses.length} courses, and ${enrollments.length} enrollments.`,
            counts: {
                students: insertedStudents.length,
                courses: insertedCourses.length,
                enrollments: enrollments.length
            }
        });

    } catch (err) {
        console.error('Seed error:', err);
        res.status(500).json({ error: 'Failed to seed database.' });
    }
});

// ── Clear all data (for re-seeding) ──────────────────────────
app.post('/api/clear', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;

        // Delete in order: enrollments → courses → students (FK constraints)
        await req.supabase.from('enrollments').delete().eq('user_id', userId);
        await req.supabase.from('courses').delete().eq('user_id', userId);
        await req.supabase.from('students').delete().eq('user_id', userId);

        res.json({ message: 'All data cleared successfully.' });
    } catch (err) {
        console.error('Clear error:', err);
        res.status(500).json({ error: 'Failed to clear database.' });
    }
});

// ── Start the server (local dev only) ────────────────────────
if (process.env.VERCEL !== '1') {
    app.listen(PORT, () => {
        console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
}

// Export for Vercel serverless
module.exports = app;
