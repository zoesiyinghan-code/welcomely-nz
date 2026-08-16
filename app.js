console.log('🔥 RUNNING APP FILE:', __filename);

// ---------------------------
//  IMPORTS & INITIAL SETUP
// ---------------------------
require('dotenv').config();
const express = require('express');
const app = express();
const session = require('express-session');
const conn = require('./dbConfig');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

app.set('view engine', 'ejs');
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false, // keep false while using localhost/http
        maxAge: 1000 * 60 * 60 * 2 // 2 hours
    }
}));

// Make session available to all EJS templates
app.use((req, res, next) => {
    res.locals.session = req.session;
    next();
});

app.use('/public', express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(helmet());

// ---------------------------
//  HOME PAGE (PUBLIC)
// ---------------------------
app.get('/', (req, res) => {
    res.render('home');
});

// ---------------------------
//  VISA INFORMATION PAGES (PUBLIC)
// ---------------------------
app.get('/temporaryVisas', (req, res) => {
    res.render('temporaryVisas');
});

app.get('/residenceVisas', (req, res) => {
    res.render('residenceVisas');
});

// ---------------------------
//  CONTACT US (PUBLIC + PUBLIC/LOGIN SUBMIT)
// ---------------------------
app.get('/contactUs', (req, res) => {
    res.render('contactUs');
});

app.post('/contactUs', (req, res) => {
    const { email, subject, message } = req.body;
    const userId = req.session.loggedin ? req.session.userId : null;

    const sql = `
        INSERT INTO contact_messages (user_id, email, subject, message)
        VALUES (?, ?, ?, ?)
    `;

    conn.query(sql, [userId, email, subject, message], (err) => {
        if (err) {
            console.error(err);
            return res.send("Error submitting your message.");
        }
        res.send("Your message has been received.");
    });
});

// ---------------------------
//  PRIVACY POLICY
// ---------------------------
app.get('/privacy', (req, res) => {
  res.render('privacyPolicy', {
    appName: 'Welcomely NZ',
    lastUpdated: '17 December 2025',
    privacyVersion: '1.0',
    privacyContactEmail: process.env.PRIVACY_CONTACT_EMAIL
  });
});

// ---------------------------
//  LOGIN/AUTH
// ---------------------------
app.get('/login', (req, res) => {
    res.render('login');
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // maximum 10 login attempts per IP
    message: 'Too many login attempts. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false
});

app.post('/auth', loginLimiter, (req, res) => {
    const { username, password } = req.body;

    const sql = `SELECT * FROM users WHERE username = ?`;

    conn.query(sql, [username], async (err, results) => {
        if (err || results.length === 0) {
            return res.send("Incorrect Username or Password!");
        }

        const user = results[0];

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.send("Incorrect Username or Password!");
        }

        // ✅ login success
        req.session.loggedin = true;
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.role = user.role.trim().toLowerCase();

        if (user.role === 'lia') {
            req.session.lia_licence = user.lia_licence;
            req.session.lia_business_name = user.lia_business_name;
        }

        res.redirect('/membersOnly');
    });
});

// ---------------------------
//  MEMBERS ONLY DASHBOARD
// ---------------------------
app.get('/membersOnly', (req, res) => {
    if (!req.session.loggedin) {
        return res.redirect('/login');
    }

    // ✅ FLASH-STYLE MESSAGES
    const successMessage = req.session.successMessage;
    const errorMessage = req.session.errorMessage;
    req.session.successMessage = null;
    req.session.errorMessage = null;

    if (req.session.role === 'lia') {
        const sql = `
            SELECT *
            FROM lia_submissions
            WHERE lia_id = ?
            ORDER BY submitted_at DESC
        `;

        conn.query(sql, [req.session.userId], (err, rows) => {
            if (err) {
                console.error(err);
                return res.send("Error loading dashboard.");
            }

            // ✅ UPDATED RENDER
            res.render('membersOnly', {
                submissions: rows,
                successMessage,
                errorMessage
            });
        });

    } else {
        res.render('membersOnly', {
            successMessage,
            errorMessage
        });
    }
});


// ---------------------------
//  FORGOT PASSWORD (PUBLIC)
// ---------------------------
app.get('/forgotPassword', (req, res) => {
    res.render('forgotPassword', {
        step: 'identify',
        errorMessage: null,
        username: null
    });
});

// Step 1: user enters username + email
app.post('/forgotPassword', (req, res) => {
    const { username, email } = req.body;

    const sql = `
        SELECT id
        FROM users
        WHERE username = ?
          AND email = ?
        LIMIT 1
    `;

    conn.query(sql, [username, email], (err, rows) => {
        if (err) {
            console.error(err);
            return res.send("Server error.");
        }

        if (!rows || rows.length === 0) {
            return res.render('forgotPassword', {
                step: 'identify',
                errorMessage: 'Username and email do not match our records.'
            });
        }

        // Generate a random token that will eventually be sent to the user
        const resetToken = crypto.randomBytes(32).toString('hex');

        // Hash the token before storing it in the database
        const hashedToken = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');

        // Token expires in 30 minutes
        const resetExpires = new Date(Date.now() + 30 * 60 * 1000);

        const updateSql = `
            UPDATE users
            SET password_reset_token = ?,
                password_reset_expires = ?
            WHERE id = ?
        `;

        conn.query(
            updateSql,
            [hashedToken, resetExpires, rows[0].id],
            (err) => {
                if (err) {
                    console.error(err);
                    return res.send("Server error.");
                }

                // Temporary development-only reset URL
                const resetUrl =
                    `http://localhost:3001/resetPassword?token=${resetToken}`;

                console.log('Password reset URL:', resetUrl);

                return res.send(
                    'Reset link generated. Check the Node terminal for the temporary development link.'
                );
            }
        );
    });
});

// Step 2: user submits new password
// User opens the password reset link
app.get('/resetPassword', (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.send('Invalid password reset link.');
    }

    // Hash the token from the URL so it can be compared
    // with the hashed token stored in MySQL
    const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

    const sql = `
        SELECT id, username
        FROM users
        WHERE password_reset_token = ?
          AND password_reset_expires > NOW()
        LIMIT 1
    `;

    conn.query(sql, [hashedToken], (err, rows) => {
        if (err) {
            console.error(err);
            return res.send('Server error.');
        }

        if (!rows || rows.length === 0) {
            return res.send(
                'This password reset link is invalid or has expired.'
            );
        }

        // Token is valid - show the password reset form
        return res.render('forgotPassword', {
            step: 'reset',
            username: rows[0].username,
            token,
            errorMessage: null
        });
    });
});

// User submits a new password using a verified reset token
app.post('/resetPassword', async (req, res) => {
    const { token, newPassword, confirmPassword } = req.body;

    if (!token) {
        return res.send('Invalid password reset request.');
    }

    if (!newPassword || newPassword.length < 8) {
        return res.render('forgotPassword', {
            step: 'reset',
            token,
            errorMessage: 'Password must be at least 8 characters.'
        });
    }

    if (newPassword !== confirmPassword) {
        return res.render('forgotPassword', {
            step: 'reset',
            token,
            errorMessage: 'Passwords do not match.'
        });
    }

    // Hash the submitted token so we can compare it
    // with the hash stored in MySQL
    const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

    const findUserSql = `
        SELECT id
        FROM users
        WHERE password_reset_token = ?
          AND password_reset_expires > NOW()
        LIMIT 1
    `;

    conn.query(findUserSql, [hashedToken], async (err, rows) => {
        if (err) {
            console.error(err);
            return res.send('Server error.');
        }

        if (!rows || rows.length === 0) {
            return res.send(
                'This password reset link is invalid or has expired.'
            );
        }

        try {
            const hashedPassword = await bcrypt.hash(newPassword, 10);

            const updateSql = `
                UPDATE users
                SET password = ?,
                    password_reset_token = NULL,
                    password_reset_expires = NULL
                WHERE id = ?
            `;

            conn.query(
                updateSql,
                [hashedPassword, rows[0].id],
                (err) => {
                    if (err) {
                        console.error(err);
                        return res.send('Server error.');
                    }

                    res.redirect('/login');
                }
            );

        } catch (err) {
            console.error(err);
            res.send('Server error.');
        }
    });
});

// ---------------------------
//  REGISTER MIGRANT (SECURE)
// ---------------------------

app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', async (req, res) => {
    const { username, email, password, acceptPrivacy } = req.body;

    if (!acceptPrivacy) {
        return res.status(400).render('register', {
            errorMessage: 'You must accept the Privacy Policy to create an account.'
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const sql = `
            INSERT INTO users
            (username, email, password, role, privacy_accepted_at, privacy_policy_version)
            VALUES (?, ?, ?, 'migrant', NOW(), ?)
        `;

        conn.query(sql, [username, email, hashedPassword, '1.0'], (err) => {
            if (err) {
                console.error(err);
                return res.render('register', {
                    errorMessage: 'Registration failed.'
                });
            }
            res.redirect('/login');
        });

    } catch (err) {
        console.error(err);
        res.send("Error creating account.");
    }
});

// ---------------------------
//  REGISTER LIA (SECURE)
// ---------------------------
app.get('/liaRegister', (req, res) => {
    res.render('liaRegister', { errorMessage: null });
});

app.post('/liaRegister', async (req, res) => {
    const {
        username,
        email,
        password,
        licence,
        businessName,
        lia_languages,
        acceptPrivacy
    } = req.body;

    if (!acceptPrivacy) {
        return res.status(400).render('liaRegister', {
            errorMessage: 'You must accept the Privacy Policy to register as an LIA.'
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const sql = `
            INSERT INTO users
            (username, email, password, role, lia_licence, lia_business_name, lia_languages, privacy_accepted_at, privacy_policy_version)
            VALUES (?, ?, ?, 'lia', ?, ?, ?, NOW(), ?)
        `;

        conn.query(
            sql,
            [
                username,
                email,
                hashedPassword,
                licence,
                businessName,
                lia_languages,
                '1.0'
            ],
            (err) => {
                if (err) {
                    console.error(err);
                    return res.render('liaRegister', {
                        errorMessage: 'Registration failed. Please try again.'
                    });
                }

                res.redirect('/login');
            }
        );

    } catch (err) {
        console.error(err);
        res.send('Error creating LIA account.');
    }
});



// ---------------------------
//  LIA INFORMATION — SHOW APPROVED POSTS
// ---------------------------
app.get('/liaInfo', (req, res) => {

        const sql = `
            SELECT 
                l.id,
                l.title,
                l.content,
                l.approved_at,
                u.username AS publisher,
                u.lia_languages,
                u.lia_business_name,
                u.lia_licence
            FROM lia_submissions l
            JOIN users u ON u.id = l.lia_id
            WHERE l.status = 'approved'
            ORDER BY l.approved_at DESC
        `;


    conn.query(sql, (err, results) => {
        if (err) {
            console.error('❌ LIA INFO SQL ERROR:', err);
            return res.send("Error loading LIA information.");
        }

        console.log('✅ LIA INFO RESULTS:', results); 

        res.render('liaInfo', {
            approved: results
        });
    });
});


// ---------------------------
//  LIA SUBMISSION (SHOW FORM)
// ---------------------------
app.get('/liaSubmit', (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'lia') {
        return res.redirect('/login');
    }

    res.render('liaSubmit');
});
// ---------------------------
//  LIA SUBMISSION (SUBMIT FORM)
// ---------------------------
// ✅ Show submitted form
app.post('/liaSubmit', (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'lia')
        return res.send("Only LIAs may submit.");

    const { title, content } = req.body;

    const sql = `
        INSERT INTO lia_submissions
        (lia_id, lia_licence, lia_business_name, title, content, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
    `;

    conn.query(
        sql,
        [
            req.session.userId,
            req.session.lia_licence,
            req.session.lia_business_name,
            title,
            content
        ],
        (err) => {
            if (err) {
                console.error(err);
                return res.send("Error submitting content.");
            }

            // ✅ STEP A
            req.session.successMessage =
                "Your LIA information has been submitted and is pending admin approval.";

            res.redirect('/membersOnly');
        }
    );
});

app.post('/liaEdit/:id', (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'lia')
        return res.send("Access denied.");

    const { title, content } = req.body;

    const sql = `
        UPDATE lia_submissions
        SET title = ?, content = ?
        WHERE id = ? AND lia_id = ? AND status = 'pending'
    `;

    conn.query(sql, [title, content, req.params.id, req.session.userId], (err, result) => {
        if (err) {
            console.error(err);
            req.session.successMessage = null;
            req.session.errorMessage = "Error saving changes. Please try again.";
            return res.redirect('/membersOnly');
        }

        // If status changed (or not pending), no rows will update
        if (result.affectedRows === 0) {
            req.session.successMessage = null;
            req.session.errorMessage = "This submission is no longer editable (not pending).";
            return res.redirect('/membersOnly');
        }

        // ✅ Confirmation feedback after save
        req.session.errorMessage = null;
        req.session.successMessage = "Changes saved. Your submission remains pending admin review.";

        res.redirect('/membersOnly');
    });
});


// ---------------------------
//  EDIT LIA SUBMISSION (VIEW)
// ---------------------------
app.get('/liaEdit/:id', (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'lia')
        return res.send("Access denied.");

    const sql = `
        SELECT *
        FROM lia_submissions
        WHERE id = ? AND lia_id = ?
    `;

    conn.query(sql, [req.params.id, req.session.userId], (err, rows) => {
        if (err) {
            console.error(err);
            return res.send("Error loading submission.");
        }

        if (rows.length === 0)
            return res.send("Submission not found.");

        res.render('liaEdit', { submission: rows[0] });
    });
});


// ---------------------------
//  DELETE LIA SUBMISSION
// ---------------------------
app.post('/liaDelete/:id', (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'lia')
        return res.send("Access denied.");

    const sql = `
        DELETE FROM lia_submissions
        WHERE id = ? AND lia_id = ? AND status = 'pending'
    `;

    conn.query(sql, [req.params.id, req.session.userId], () => {
        res.redirect('/membersOnly');
    });
});


// ---------------------------
//  PUBLIC LIA PROFILE
// ---------------------------
app.get('/lia/:username', (req, res) => {
    const sql = `
        SELECT 
            u.username,
            u.email,
            u.lia_business_name,
            u.lia_licence,
            u.lia_languages,
            l.title,
            l.content,
            l.approved_at
        FROM users u
        LEFT JOIN lia_submissions l
        ON u.id = l.lia_id AND l.status = 'approved'
        WHERE u.username = ?
    `;


    conn.query(sql, [req.params.username], (err, rows) => {
        if (err) {
            console.error(err);
            return res.send("Server error.");
        }

        if (!rows || rows.length === 0)
            return res.send("LIA profile not found.");

        res.render('liaProfile', {
            profile: rows[0],
            posts: rows.filter(r => r.title)
        });
    });
});

// ---------------------------
//  MIGRANT QUERIES (PAGE)
// ---------------------------
app.get('/migrantQueries', (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'migrant') {
        return res.redirect('/login');
    }

    res.render('migrantQueries', {
        successMessage: req.session.successMessage,
        errorMessage: req.session.errorMessage
    });

    // clear flash messages after render
    req.session.successMessage = null;
    req.session.errorMessage = null;
});

// ---------------------------
//  MIGRANT QUERIES (SUBMIT)
// ---------------------------
app.post('/migrantQueries', (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'migrant') {
        return res.redirect('/login');
    }

    const sql = `
        INSERT INTO migrant_queries (migrant_id, question)
        VALUES (?, ?)
    `;

    conn.query(sql, [req.session.userId, req.body.question], (err) => {
        if (err) {
            console.error(err);
            req.session.successMessage = null;
            req.session.errorMessage = "Error submitting your question. Please try again.";
            return res.redirect('/migrant/myqueries');
        }

        // ✅ one-time success message
        req.session.errorMessage = null;
        req.session.successMessage = "Your question has been submitted successfully.";

        // Redirect to the page you want to show the alert on
        res.redirect('/migrant/myqueries');
    });
});

// ---------------------------
//  MIGRANT: VIEW MY QUERIES + ADMIN REPLIES (with one-time success/error alerts)
// ---------------------------
app.get('/migrant/myqueries', (req, res) => {
    if (!req.session.loggedin) {
        return res.redirect('/login');
    }

    // Only migrants should access this page
    if (req.session.role !== 'migrant') {
        return res.redirect('/membersOnly');
    }

    const sql = `
        SELECT
            id,
            question,
            admin_reply,
            status,
            submitted_at,
            replied_at
        FROM migrant_queries
        WHERE migrant_id = ?
        ORDER BY submitted_at DESC
    `;

    conn.query(sql, [req.session.userId], (err, rows) => {
        if (err) {
            console.error(err);
            return res.send("Error loading your queries.");
        }

        // ✅ Flash-style messages: read once, then clear
        const successMessage = req.session.successMessage;
        const errorMessage = req.session.errorMessage;
        req.session.successMessage = null;
        req.session.errorMessage = null;

        res.render('migrantMyQueries', {
            queries: rows,
            successMessage,
            errorMessage
        });
    });
});


// ---------------------------
//  ADMIN — REVIEW LIA SUBMISSIONS
// ---------------------------

app.get('/adminReview', (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'admin')
        return res.send("Admin access only.");

    const sql = `
        SELECT 
            l.id,
            l.title,
            l.content,
            l.submitted_at,
            u.username AS publisher,
            l.lia_business_name,
            l.lia_licence
        FROM lia_submissions l
        JOIN users u ON l.lia_id = u.id
        WHERE l.status = 'pending'
        ORDER BY l.submitted_at DESC
    `;

    conn.query(sql, (err, rows) => {
        res.render('adminReview', { pending: rows });
    });
});

app.post('/approveSubmission/:id', (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'admin')
        return res.send("Access denied.");

    conn.query(
        `UPDATE lia_submissions SET status='approved', approved_at=NOW() WHERE id=?`,
        [req.params.id],
        () => res.redirect('/adminReview')
    );
});

app.post('/rejectSubmission/:id', (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'admin')
        return res.send("Access denied.");

    conn.query(
        `UPDATE lia_submissions SET status='rejected' WHERE id=?`,
        [req.params.id],
        () => res.redirect('/adminReview')
    );
});

// ---------------------------
//  ADMIN — VIEW MIGRANT QUERIES (Inbox)
// ---------------------------
app.get('/admin/migrantqueries', (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'admin') {
        return res.redirect('/login');
    }

    const sql = `
        SELECT
            q.id,
            q.migrant_id,
            q.question,
            q.admin_reply,
            q.status,
            q.submitted_at,
            q.replied_at,
            u.username
        FROM migrant_queries q
        LEFT JOIN users u ON q.migrant_id = u.id
        ORDER BY q.submitted_at DESC
    `;

    conn.query(sql, (err, rows) => {
        if (err) {
            console.error(err);
            return res.send("Error loading migrant queries.");
        }

        // We will re-purpose adminContact.ejs for this inbox
        // (so you don't need a new file name)
        res.render('adminContact', { queries: rows });
    });
});
// ---------------------------
//  ADMIN — REPLY TO MIGRANT QUERY
// ---------------------------
app.post('/admin/migrantqueries/reply/:id', (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'admin') {
        return res.redirect('/login');
    }

    const queryId = req.params.id;
    const { admin_reply } = req.body;

    if (!admin_reply || admin_reply.trim() === '') {
        return res.redirect('/admin/migrantqueries');
    }

    const sql = `
        UPDATE migrant_queries
        SET
            admin_reply = ?,
            status = 'resolved',
            replied_at = NOW()
        WHERE id = ?
    `;

    conn.query(sql, [admin_reply, queryId], (err) => {
        if (err) {
            console.error(err);
            return res.send("Error saving reply.");
        }
        res.redirect('/admin/migrantqueries');
    });
});

// ---------------------------
//  ADMIN — VIEW CONTACT MESSAGES 
// ---------------------------
app.get('/admin/contactmessages', (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'admin') {
        return res.redirect('/login');
    }

    const sql = `
        SELECT
            c.id,
            c.user_id,
            c.email,
            c.subject,
            c.message,
            c.admin_reply,
            c.status,
            c.submitted_at,
            c.replied_at,
            u.username
        FROM contact_messages c
        LEFT JOIN users u ON c.user_id = u.id
        ORDER BY c.submitted_at DESC
    `;

    conn.query(sql, (err, rows) => {
        if (err) {
            console.error(err);
            return res.send("Error loading contact messages.");
        }

        // IMPORTANT: match the view file you created:
        // views/adminContactMessages.ejs
        res.render('adminContactMessages', { messages: rows });
    });
});


/// ---------------------------
//  ADMIN: SAVE CONTACT REPLY
// ---------------------------
app.post('/admin/contactmessages/reply/:id', (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'admin') {
        return res.redirect('/login');
    }

    const messageId = req.params.id;
    const { admin_reply } = req.body;

    if (!admin_reply || admin_reply.trim() === '') {
        return res.redirect('/admin/contactmessages');
    }

    const sql = `
        UPDATE contact_messages
        SET
            admin_reply = ?,
            status = 'resolved',
            replied_at = NOW()
        WHERE id = ?
    `;

    conn.query(sql, [admin_reply, messageId], (err) => {
        if (err) {
            console.error(err);
            return res.send("Error saving admin reply.");
        }

        res.redirect('/admin/contactmessages');
    });
});


// ---------------------------
//  LOGOUT
// ---------------------------
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});


// ---------------------------
//  START SERVER
// ---------------------------
app.listen(3001, () => {
    console.log("Server running on port 3001");
});
