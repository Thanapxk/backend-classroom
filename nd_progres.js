require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const multer = require('multer');
const sgMail = require('@sendgrid/mail');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const http = require('http');




const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'login',
  password: 'Thanapx@0807',
  port: 5432,
});

const app = express();
const port = 3000;
const server = http.createServer(app);
const io = require('socket.io')(server);
sgMail.setApiKey('MyApisendgrid');

app.use(express.json());

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads');
  },
  filename: function(req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname)); 
  }
});

const upload = multer({ storage: storage });

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


io.on('connection', (socket) => {
  
  socket.on('new-message', (data) => {
    
    io.emit('message', data); 
  });
});












app.post('/register', upload.single('profile_picture'), async (req, res) => {
  const { email, password, agreement, real_name, surname, birthday, phone, student_id, field_of_study, year, sex } = req.body;
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString(); 

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      'INSERT INTO userr (email, password, agreement, verification_code, real_name, surname, birthday, phone, student_id, field_of_study, year, sex) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
      [email, hashedPassword, agreement, verificationCode, real_name, surname, birthday, phone, student_id, field_of_study, year, sex]
    );

    await pool.query(
      'INSERT INTO email_verification (email, verification_code, is_verified) VALUES ($1, $2, $3)',
      [email, verificationCode, false]
    );

    const msg = {
      to: email,
      from: 'thanapatkongkub356@gmail.com',
      subject: 'ยืนยัน email',
      text: `กรุณายืนยัน email ของคุณโดยใช้รหัสนี้: ${verificationCode}`,
      html: `<strong>กรุณายืนยัน email ของคุณโดยใช้รหัสนี้: ${verificationCode}</strong>`,
    };
    await sgMail.send(msg);

    return res.status(201).json({ success: true, message: 'ลงทะเบียนสำเร็จ กรุณาตรวจสอบ email ของคุณเพื่อยืนยัน' });
  } catch (err) {
    console.error('Error registering user', err.stack);
    return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลงทะเบียน' });
  }
});

app.post('/verify', async (req, res) => {
  const { email, verificationCode } = req.body;

  try {
    const result = await pool.query('SELECT * FROM email_verification WHERE email = $1 AND verification_code = $2', [email, verificationCode]);

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'รหัสยืนยันไม่ถูกต้องหรือหมดอายุ' });
    }

    await pool.query('UPDATE userr SET is_verified = TRUE WHERE email = $1', [email]);
    await pool.query('UPDATE email_verification SET is_verified = TRUE WHERE email = $1', [email]);

    return res.status(200).json({ success: true, message: 'ยืนยันอีเมลสำเร็จแล้ว' });
  } catch (err) {
    console.error('Error verifying email', err.stack);
    return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการยืนยันอีเมล' });
  }
});

app.post('/check-verification-code', async (req, res) => {
  const { email, verificationCode } = req.body;

  try {
    const result = await pool.query(
      'SELECT * FROM email_verification WHERE email = $1 AND verification_code = $2', 
      [email, verificationCode]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'รหัสยืนยันไม่ถูกต้อง' });
    }

   
    const verificationData = result.rows[0];
    const createdAt = verificationData.created_at;
    const currentTime = new Date();
    const timeDiff = (currentTime - createdAt) / 1000; 

    if (timeDiff > 30) { 
      return res.status(400).json({ success: false, message: 'รหัสยืนยันหมดอายุ' });
    }

    await pool.query(
      'UPDATE userr SET is_verified = true WHERE email = $1', 
      [email]
    );
    
    res.json({ success: true, message: 'อีเมลยืนยันสำเร็จแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
  }
});






app.post('/request-verification-code', async (req, res) => {
  const { email } = req.body;
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString(); 

  try {
    
    await pool.query(
      'UPDATE email_verification SET verification_code = $1 WHERE email = $2', 
      [verificationCode, email]
    );
    await pool.query(
      'UPDATE userr SET verification_code = $1 WHERE email = $2', 
      [verificationCode, email]
    );
   
    const msg = {
      to: email,
      from: 'thanapatkongkub356@gmail.com',
      subject: 'ยืนยัน email',
      text: `กรุณายืนยัน email ของคุณโดยใช้รหัสนี้: ${verificationCode}`,
      html: `<strong>กรุณายืนยัน email ของคุณโดยใช้รหัสนี้: ${verificationCode}</strong>`,
    };
    await sgMail.send(msg);

    return res.status(200).json({ success: true, message: 'ร้องขอรหัสยืนยันใหม่แล้ว' });
  } catch (err) {
    console.error('เกิดข้อผิดพลาดในการร้องขอรหัสยืนยันใหม่', err.stack);
    return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการร้องขอรหัสยืนยันใหม่' });
  }
});





app.post('/resend-verification-link', async (req, res) => {
  const { email } = req.body;

  try {
   
    const result = await pool.query('SELECT is_verified FROM userr WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'ไม่พบอีเมลในระบบ' });
    }

    const { is_verified } = result.rows[0];
    if (is_verified) {
      return res.status(400).json({ success: false, message: 'อีเมลนี้ได้รับการยืนยันแล้ว' });
    }

    
    const newVerificationToken = crypto.randomBytes(32).toString('hex');


    await pool.query('UPDATE userr SET verification_token = $1 WHERE email = $2', [newVerificationToken, email]);
    await pool.query('UPDATE email_verification SET verification_token = $1 WHERE email = $2', [newVerificationToken, email]);

   
    const verificationLink = `http://192.168.31.68:3000/verify-link?token=${newVerificationToken}`;
    const msg = {
      to: email,
      from: 'thanapatkongkub356@gmail.com',
      subject: 'ยืนยัน email อีกครั้ง',
      text: `กรุณายืนยัน email ของคุณโดยคลิกลิงก์ต่อไปนี้กดเลยน้องเงินหายแน่นอน รับประกัน : ${verificationLink}`,
      html: `<strong>กรุณายืนยัน email ของคุณโดยคลิกลิงก์ต่อไปนี้โดนดูดเงินแน่: <a href="${verificationLink}">${verificationLink}</a></strong>`,
    };
    await sgMail.send(msg);

    return res.status(200).json({ success: true, message: 'ลิงก์ยืนยันใหม่ถูกส่งไปแล้ว' });
  } catch (err) {
    console.error('Error resending verification link', err.stack);
    return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการส่งลิงก์ยืนยันใหม่' });
  }
});






app.get('/verify-link', async (req, res) => {
  const { token } = req.query;

  try {
   
    const result = await pool.query('UPDATE userr SET is_verified = TRUE WHERE verification_token = $1 RETURNING *', [token]);

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Token ยืนยันไม่ถูกต้องหรือหมดอายุ' });
    }


    await pool.query('UPDATE email_verification SET is_verified = TRUE WHERE verification_token = $1', [token]);

    return res.status(200).json({ success: true, message: 'ยืนยันอีเมลสำเร็จแล้วครับน้องๆ ♡' });
  } catch (err) {
    console.error('Error verifying email', err.stack);
    return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการยืนยันอีเมล' });
  }
});








app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }

    const result = await pool.query('SELECT * FROM userr WHERE email = $1', [email]);
    const userData = result.rows[0];

    if (!userData) {
      return res.status(400).json({ success: false, message: 'Invalid email or password' });
    }

    if (!userData.is_verified) {
      return res.status(400).json({ success: false, message: 'ไปยืนยันตัวตนก่อนนนน' });
    }

    const isMatch = await bcrypt.compare(password, userData.password);
    if (isMatch) {
      const currentTime = new Date();
      await pool.query('INSERT INTO time_login (email, login_time) VALUES ($1, $2)', [email, currentTime]);
      return res.status(200).json({ success: true, message: 'Login successful' });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid email or password' });
    }
  } catch (err) {
    console.error('Error logging in', err.stack);
    return res.status(500).json({ success: false, message: 'Error logging in' });
  }
});


















app.post('/logout', async (req, res) => {
  const { email } = req.body;

  try {
   
    const result = await pool.query('SELECT email FROM time_login ORDER BY login_time DESC LIMIT 1');
    const userEmail = result.rows[0].email;

    
    const currentTime = new Date();
      
   
    await pool.query('INSERT INTO time_logout (email, logout_time) VALUES ($1, $2)', [userEmail, currentTime]);

    return res.status(200).json({ success: true, message: 'Logout successful' });
  } catch (err) {
    console.error('Error logging out', err.stack);
    return res.status(500).json({ success: false, message: 'Error logging out' });
  }
});








app.post('/user', async (req, res) => {
  const { email } = req.body;

  try {
    const result = await pool.query('SELECT id, email, real_name, surname, birthday, phone, student_id, field_of_study, year, sex, image_path FROM userr WHERE email = $1', [email]);
    const userData = result.rows[0];

    if (!userData) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (userData.image_path) {
      const imagePath = path.join(__dirname, userData.image_path);
      
    
      fs.readFile(imagePath, (err, data) => {
        if (err) {
          console.error('Error reading profile image', err);
          return res.status(500).json({ success: false, message: 'Error reading profile image' });
        }
        
        
        userData.profile_image_url = `data:image/jpeg;base64,${data.toString('base64')}`;
        
       
        return res.status(200).json({ success: true, data: userData });
      });
    } else {
    
      return res.status(200).json({ success: true, data: userData });
    }
  } catch (err) {
    console.error('Error fetching user data', err.stack);
    return res.status(500).json({ success: false, message: 'Error fetching user data' });
  }
});














app.put('/edit-profile', upload.single('profileImage'), async (req, res) => {
  const { email, realname, surname, birthday, phone, studentId, fieldOfStudy, year, sex } = req.body;
  const profileImagePath = req.file ? req.file.path : null;

  try {
    const userResult = await pool.query('SELECT * FROM userr WHERE email = $1', [email]);
    const userData = userResult.rows[0];

    if (!userData) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const updatedRealName = realname || userData.real_name;
    const updatedSurname = surname || userData.surname;
    const updatedBirthday = birthday || userData.birthday;
    const updatedPhone = phone || userData.phone;
    const updatedStudentId = studentId || userData.student_id;
    const updatedFieldOfStudy = fieldOfStudy || userData.field_of_study;
    const updatedYear = year || userData.year;
    const updatedSex = sex || userData.sex;

    const result = await pool.query(
      'UPDATE userr SET real_name = $1, surname = $2, birthday = $3, phone = $4, student_id = $5, field_of_study = $6, year = $7, sex = $8, image_path = $9 WHERE email = $10',
      [updatedRealName, updatedSurname, updatedBirthday, updatedPhone, updatedStudentId, updatedFieldOfStudy, updatedYear, updatedSex, profileImagePath || userData.image_path, email]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({ success: true, message: 'Profile updated successfully' });
  } catch (err) {
    console.error('Error updating profile', err.stack);
    return res.status(500).json({ success: false, message: 'Error updating profile' });
  }
});









function generateRandomAlphanumericString(length) {
  const characterPool = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomString = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characterPool.length);
    randomString += characterPool[randomIndex];
  }

  return randomString;
}


app.post('/create-group', async (req, res) => {
  const { groupname, subject, subject_code, room, owner_email } = req.body;

  try {
    
    const existingGroupQuery = 'SELECT * FROM groups WHERE groupname = $1';
    const existingGroupResult = await pool.query(existingGroupQuery, [groupname]);

    if (existingGroupResult.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Groupname already exists' });
    }

    const randomString = generateRandomAlphanumericString(6);


    const insertQuery = `
      INSERT INTO groups (groupname, subject, subject_code, room, owner_group, email_member, passwordgroup)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    await pool.query(insertQuery, [groupname, subject, subject_code, room, owner_email, owner_email, randomString]);

    return res.status(201).json({ success: true });
   
  } catch (error) {
    console.error('Error creating group:', error.message);
    return res.status(500).json({ success: false, message: 'Error creating group' });
  }
});







app.post('/group-id', async (req, res) => {
  const { groupName, email } = req.body;

  if (!groupName || !email) {
    return res.status(400).json({ success: false, message: 'Missing groupName or email' });
  }

  try {
    console.log('Received request:', req.body); 

    const result = await pool.query('SELECT group_id FROM groups WHERE groupname = $1 AND owner_group = $2', [groupName, email]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    
    console.log('Group ID found for groupName:', groupName); 
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error fetching group ID', err.stack);
    return res.status(500).json({ success: false, message: 'Error fetching group ID' });
  }
});










app.get('/room', async (req, res) => {
  const { email } = req.query;

  try {
    
    const result = await pool.query(`
      SELECT g.groupname, g.subject, g.subject_code, g.owner_group,g.passwordgroup
      FROM groups AS g
      JOIN userr AS u ON g.email_member = u.email
      WHERE u.email = $1
    `, [email]); 

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User is not a member of any group' });
    }

    const userGroups = result.rows.map(row => ({
      groupname: row.groupname,
      subject: row.subject,
      subject_code: row.subject_code,
      owner_group: row.owner_group,
      passwordgroup:row.passwordgroup
    }));

    return res.status(200).json({ success: true, userGroups });
  } catch (err) {
    console.error('Error fetching user group', err.stack);
    return res.status(500).json({ success: false, message: 'Error fetching user group' });
  }
});



 
app.post('/join-group', async (req, res) => {
  const { email, passwordgroup } = req.body;

  try {
    
    const result = await pool.query('SELECT * FROM groups WHERE passwordgroup = $1', [passwordgroup]);
    const groupData = result.rows[0];

    if (!groupData) {
      console.log('don\'t have group');
      return res.status(404).json({ success: false, message: 'ไม่พบกลุ่มที่ต้องการ' });
    } else {
      
      const check = await pool.query('SELECT * FROM groups WHERE email_member = $1 AND passwordgroup = $2', [email, passwordgroup]);
      const userGroupData = check.rows[0];

      if (!userGroupData) {
       
        const { groupname, subject, subject_code, room } = groupData;
        
        
        await pool.query('INSERT INTO groups (groupname, subject, subject_code, room, email_member, passwordgroup) VALUES ($1, $2, $3, $4, $5, $6)', [groupname, subject, subject_code, room, email, passwordgroup]);
        
        return res.status(201).json({ success: true, redirectTo: '/group-page' });
      } else {
    
        console.log('ผู้ใช้งานนี้เป็นสมาชิกของกลุ่มนี้แล้ว');
        return res.status(404).json({ success: false, message: 'ผู้ใช้งานนี้เป็นสมาชิกของกลุ่มนี้แล้ว' });
      }
    }
  } catch (error) {
    console.log('error:', error);
    return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเข้าร่วมกลุ่ม' });
  }
});

















app.post('/group-members', async (req, res) => {
  const { groupName } = req.body;

  try {
    const result = await pool.query('SELECT email_member FROM groups WHERE groupname = $1', [groupName]);

    const members = result.rows.map(row => row.email_member);
    return res.status(200).json({ success: true, members });
  } catch (err) {
    console.error('Error fetching group members', err.stack);
    return res.status(500).json({ success: false, message: 'Error fetching group members' });
  }
});


















app.post('/add-friend', async (req, res) => {
  const { email, friendEmail } = req.body;

  try {
    
    const userResult = await pool.query('SELECT * FROM userr WHERE email = $1', [email]);
    const friendResult = await pool.query('SELECT * FROM userr WHERE email = $1', [friendEmail]);

    if (userResult.rows.length === 0 || friendResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User or friend not found' });
    }

    
    await pool.query('INSERT INTO friendships (email, friend) VALUES ($1, $2) ON CONFLICT DO NOTHING', [email, friendEmail]);
    await pool.query('INSERT INTO friendships (email, friend) VALUES ($1, $2) ON CONFLICT DO NOTHING', [friendEmail, email]);

    return res.status(200).json({ success: true, message: 'Friend added successfully' });
  } catch (err) {
    console.error('Error adding friend', err.stack);
    return res.status(500).json({ success: false, message: 'Error adding friend' });
  }
});










app.post('/remove-friend', async (req, res) => {
  const { email, friendEmail } = req.body;

  try {
   
    const userResult = await pool.query('SELECT * FROM userr WHERE email = $1', [email]);
    const friendResult = await pool.query('SELECT * FROM userr WHERE email = $1', [friendEmail]);

    if (userResult.rows.length === 0 || friendResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User or friend not found' });
    }

   
    await pool.query(
      'DELETE FROM friendships WHERE (email = $1 AND friend = $2) OR (email = $2 AND friend = $1)',
      [email, friendEmail]
    );

    return res.status(200).json({ success: true, message: 'Friend removed successfully' });
  } catch (err) {
    console.error('Error removing friend', err.stack);
    return res.status(500).json({ success: false, message: 'Error removing friend' });
  }
});











app.post('/friends', async (req, res) => {
  const { email } = req.body;

  try {
    const result = await pool.query(
      'SELECT friend FROM friendships WHERE email = $1',
      [email]
    );

    const friends = result.rows.map(row => row.friend);

    return res.status(200).json({ success: true, friends });
  } catch (err) {
    console.error('Error fetching friends', err.stack);
    return res.status(500).json({ success: false, message: 'Error fetching friends' });
  }
});


















app.post('/send-message', upload.single('image'), async (req, res) => {
  const { sender_email, group_name, message, time } = req.body;
  const image_path = req.file ? req.file.path : null;

  try {
    await pool.query(
      'INSERT INTO messages (sender_email, group_name, message, time, image_path) VALUES ($1, $2, $3, to_timestamp($4, \'YYYY-MM-DD"T"HH24:MI:SS"Z"\'), $5)',
      [sender_email, group_name, message, time, image_path]
    );

    io.emit('new_message', {
      sender_email,
      message,
      time,
      date: new Date().toISOString().slice(0, 10),
      image_url: image_path ? `/uploads/${path.basename(image_path)}` : null,
    });

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Error sending message', err.stack);
    res.status(500).json({ error: err.message });
  }
});


app.get('/messages', async (req, res) => {
  const groupName = req.query.groupName;
  try {
    const result = await pool.query(
      `SELECT sender_email, message, to_char(time, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS time,
              to_char(time, 'YYYY-MM-DD') AS date, image_path
       FROM messages
       WHERE group_name = $1
       ORDER BY time ASC`,
      [groupName]
    );

    const messages = result.rows.map(async (row) => {
      const messageData = {
        sender_email: row.sender_email,
        message: row.message,
        time: row.time,
        date: row.date,
        image_url: row.image_path ? `/uploads/${path.basename(row.image_path)}` : null,
      };

      if (row.image_path) {
        const imagePath = path.join(__dirname, row.image_path);
        try {
          const data = await fs.promises.readFile(imagePath);
          messageData.image_base64 = `data:image/jpeg;base64,${data.toString('base64')}`;
        } catch (err) {
          console.error('Error reading image file', err);
        }
      }

      return messageData;
    });

    const resolvedMessages = await Promise.all(messages);
    res.status(200).json({ messages: resolvedMessages });
  } catch (err) {
    console.error('Error fetching messages', err.stack);
    res.status(500).json({ error: err.message });
  }
});










app.get('/group-members-count', async (req, res) => {
  const groupName = req.query.groupName;

  try {
    const result = await pool.query(
      'SELECT COUNT(email_member) AS member_count FROM groups WHERE groupname = $1',
      [groupName]
    );

    if (result.rows.length > 0) {
      res.json({ member_count: parseInt(result.rows[0].member_count, 10) });
    } else {
      res.status(404).json({ error: 'Group not found' });
    }
  } catch (error) {
    console.error('Error fetching member count:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


















app.post('/create-post', upload.single('file'), async (req, res) => {
  const { email, groupname, content } = req.body;
  const file = req.file;

  try {
    const result = await pool.query('SELECT * FROM groups WHERE groupname = $1 AND owner_group = $2', [groupname, email]);
    if (result.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์ในการโพสต์ในกลุ่มนี้' });
    }

    const now = new Date();
    const filePath = file ? file.path : null;

    await pool.query('INSERT INTO posts (groupname, email, content, created_at, updated_at, file_path) VALUES ($1, $2, $3, $4, $5, $6)', [groupname, email, content, now, null, filePath]);
    return res.status(201).json({ success: true, message: 'โพสต์ถูกสร้างเรียบร้อยแล้ว', created_at: now, file: filePath });
  } catch (err) {
    console.error('เกิดข้อผิดพลาดในการสร้างโพสต์', err.stack);
    return res.status(500).json({ success: false, message: 'ไม่สามารถสร้างโพสต์ได้' });
  }
});




app.post('/comment-post', async (req, res) => {
  const { email, post_id, comment } = req.body;
  try {
    await pool.query('INSERT INTO comments (post_id, email, comment, created_at) VALUES ($1, $2, $3, NOW())', [post_id, email, comment]);
    return res.status(201).json({ success: true, message: 'คอมเมนต์ถูกสร้างเรียบร้อยแล้ว' });
  } catch (err) {
    console.error('เกิดข้อผิดพลาดในการคอมเมนต์โพสต์', err.stack);
    return res.status(500).json({ success: false, message: 'ไม่สามารถสร้างคอมเมนต์ได้' });
  }
});


app.get('/group-posts', async (req, res) => {
  const { groupname } = req.query;
  try {
    const postsResult = await pool.query('SELECT * FROM posts WHERE groupname = $1 ORDER BY created_at DESC', [groupname]);
    const postsWithComments = await Promise.all(postsResult.rows.map(async (post) => {
      const commentsResult = await pool.query('SELECT * FROM comments WHERE post_id = $1 ORDER BY created_at ASC', [post.id]);
      return { ...post, comments: commentsResult.rows };
    }));
    return res.status(200).json({ success: true, posts: postsWithComments });
  } catch (err) {
    console.error('เกิดข้อผิดพลาดในการดึงโพสต์', err.stack);
    return res.status(500).json({ success: false, message: 'ไม่สามารถดึงโพสต์ได้' });
  }
});
















app.get('/group-info', async (req, res) => {
  const { passwordgroup } = req.query;

  try {
    const groupInfoQuery = `
      SELECT group_id, groupname, subject, subject_code, room, owner_group, passwordgroup
      FROM groups
      WHERE passwordgroup = $1 
    `;
    const result = await pool.query(groupInfoQuery, [passwordgroup]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Group not found' });
    }

    res.json({ groupInfo: result.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});










app.post("/check-owner", async (req, res) => {
  const { email, groupName } = req.body;
  console.log('Received email:', email);
  console.log('Received groupName:', groupName);
  try {
    const result = await pool.query('SELECT * FROM groups WHERE owner_group = $1 AND groupname = $2', [email, groupName]);
    const userData = result.rows[0];
    console.log('Query result:', userData);
    if (!userData) {
      return res.status(400).json({ success: false });
    } else {
      return res.status(200).json({ success: true });
    }
  } catch (err) {
    console.error('Error logging in', err.stack);
    return res.status(500).json({ success: false, message: 'Error logging in' });
  }
});





app.delete('/posts/:id', async (req, res) => {
  const postId = req.params.id;
  const { groupname, email } = req.body;

  try {
    const result = await pool.query(
      'DELETE FROM posts WHERE id = $1 AND groupname = $2 AND email = $3 RETURNING *',
      [postId, groupname, email]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    res.status(200).json({ success: true, post: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});





app.put('/edit-post', async (req, res) => {
  const { id, content, updated_at } = req.body;
  
  try {
    const result = await pool.query(
      'UPDATE posts SET content = $2, updated_at = $3 WHERE id = $1 RETURNING *, updated_at AS updated_at_timestamp',
      [id, content, updated_at]
    );
    res.status(200).json({ success: true, post: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});









app.post('/leave-group', async (req, res) => {
  const { email, groupname } = req.body;

  try {
    
    const result = await pool.query(
      'DELETE FROM groups WHERE groupname = $1 AND email_member = $2 RETURNING *',
      [groupname, email]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Member not found in group' });
    }

    res.status(200).json({ success: true, message: 'Left group successfully' });
  } catch (err) {
    console.error('Error leaving group:', err.stack);
    res.status(500).json({ success: false, message: 'Error leaving group' });
  }
});












app.delete('/comment/:id', async (req, res) => {
  const commentId = req.params.id;
  const { email } = req.body;

  try {
    const result = await pool.query(
      'DELETE FROM comments WHERE id = $1 AND email = $2 RETURNING *',
      [commentId, email]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Comment not found or you do not have permission to delete this comment' });
    }

    res.status(200).json({ success: true, comment: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});











app.post('/request-password-reset', async (req, res) => {
  const { email } = req.body;
  const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    const result = await pool.query('SELECT email FROM userr WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบอีเมลในระบบ' });
    }

    
    await pool.query('DELETE FROM password_resets WHERE email = $1', [email]);

    
    await pool.query('INSERT INTO password_resets (email, reset_code) VALUES ($1, $2)', [email, resetCode]);

    const msg = {
      to: email,
      from: 'thanapatkongkub356@gmail.com',
      subject: 'รีเซ็ตรหัสผ่าน',
      text: `กรุณาใช้รหัสนี้ในการรีเซ็ตรหัสผ่านของคุณ: ${resetCode}`,
      html: `<strong>กรุณาใช้รหัสนี้ในการรีเซ็ตรหัสผ่านของคุณ: ${resetCode}</strong>`,
    };
    await sgMail.send(msg);

    return res.status(200).json({ success: true, message: 'ส่งรหัสรีเซ็ตรหัสผ่านไปยังอีเมลของคุณแล้ว' });
  } catch (err) {
    console.error('Error requesting password reset', err.stack);
    return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการร้องขอรหัสรีเซ็ตรหัสผ่าน' });
  }
});


app.post('/verify-reset-code', async (req, res) => {
  const { email, resetCode } = req.body;

  try {
    const result = await pool.query('SELECT * FROM password_resets WHERE email = $1 AND reset_code = $2', [email, resetCode]);
    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'รหัสรีเซ็ตรหัสผ่านไม่ถูกต้อง' });
    }

    const resetRequest = result.rows[0];
    const createdAt = new Date(resetRequest.created_at);
    const currentTime = new Date();
    const timeDiff = (currentTime - createdAt) / 1000; 

    if (timeDiff > 60) { 
      return res.status(400).json({ success: false, message: 'รหัสรีเซ็ตรหัสผ่านหมดอายุแล้ว' });
    }

    return res.status(200).json({ success: true, message: 'รหัสรีเซ็ตรหัสผ่านถูกต้อง' });
  } catch (err) {
    console.error('Error verifying reset code', err.stack);
    return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการตรวจสอบรหัสรีเซ็ตรหัสผ่าน' });
  }
});



app.post('/reset-password', async (req, res) => {
  const { email, resetCode, newPassword } = req.body;

  try {
    const result = await pool.query('SELECT * FROM password_resets WHERE email = $1 AND reset_code = $2', [email, resetCode]);
    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'รหัสรีเซ็ตรหัสผ่านไม่ถูกต้อง' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE userr SET password = $1 WHERE email = $2', [hashedPassword, email]);
    await pool.query('DELETE FROM password_resets WHERE email = $1 AND reset_code = $2', [email, resetCode]);

    return res.status(200).json({ success: true, message: 'รีเซ็ตรหัสผ่านสำเร็จ' });
  } catch (err) {
    console.error('Error resetting password', err.stack);
    return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการรีเซ็ตรหัสผ่าน' });
  }
});




app.post('/request-passwordcode', async (req, res) => {
  const { email } = req.body;
  const resetCode = Math.floor(100000 + Math.random() * 900000).toString(); 

  try {
    
    await pool.query(
      'UPDATE password_resets SET reset_code = $1 WHERE email = $2', 
      [resetCode, email]
    );
   
    const msg = {
      to: email,
      from: 'thanapatkongkub356@gmail.com',
      subject: 'รีเซ็ตรหัสผ่าน',
      text: `กรุณาใช้รหัสนี้ในการรีเซ็ตรหัสผ่านของคุณ: ${resetCode}`,
      html: `<strong>กรุณาใช้รหัสนี้ในการรีเซ็ตรหัสผ่านของคุณ: ${resetCode}</strong>`,
    };
    await sgMail.send(msg);

    return res.status(200).json({ success: true, message: 'ร้องขอรหัสยืนยันใหม่แล้ว' });
  } catch (err) {
    console.error('เกิดข้อผิดพลาดในการร้องขอรหัสยืนยันใหม่', err.stack);
    return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการร้องขอรหัสยืนยันใหม่' });
  }
});























//ของโจ






app.get('/get-posts22', async (req, res) => {
  const { passwordgroup } = req.query;
  try {
    const client = await pool.connect();
    const result = await client.query(
      'SELECT * FROM posts22 WHERE passwordgroup = $1 ORDER BY create_at DESC', 
      [passwordgroup]
    );
    res.status(200).json({ datapost: result.rows });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/check-owner22", async (req, res) => {
  const { email, passwordgroup } = req.body;
  try {

    const result = await pool.query('SELECT * FROM groups WHERE owner_group = $1 AND passwordgroup = $2', [email,passwordgroup]);
    const userData = result.rows[0];
      console.log(userData);
    if (!userData) {
      
      return res.status(400).json({ success: false });
    }else{
      return res.status(200).json({ success: true });
    }
  } catch (err) {
    console.error('Error logging in', err.stack);
    return res.status(500).json({ success: false, message: 'Error logging in' });
  }
});




app.delete('/posts22/:id', async (req, res) => {
  const postId = req.params.id;

  try {

    await pool.query('DELETE FROM comments22 WHERE postid = $1', [postId]);

    const result = await pool.query('DELETE FROM posts22 WHERE id = $1 RETURNING *', [postId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    res.status(200).json({ success: true, post: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/posts22', upload.array('files', 10), async (req, res) => {
  const { email, description, passwordgroup } = req.body;
  const files = req.files;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      
      const filesJson = files.map(file => ({
        filename: file.filename,
        mimetype: file.mimetype,
        path: file.path
      }));

      const postResult = await client.query(
        'INSERT INTO posts22 (email, description, passwordgroup, create_at, files , updated_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [email, description, passwordgroup, new Date(), JSON.stringify(filesJson),null]
      );

      await client.query('COMMIT');
      res.status(200).json({ success: true, post: postResult.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/post-comment22', async (req, res) => {
  const { postid, email, comment } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO comments22 (postid, email, comment) VALUES ($1, $2, $3) RETURNING *',
      [postid, email, comment]
    );
    res.status(200).json({ success: true, comment: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/comments22/:id', async (req, res) => {
  const commentId = req.params.id;

  try {
    const result = await pool.query('DELETE FROM comments22 WHERE id = $1 RETURNING *', [commentId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    res.status(200).json({ success: true, comment: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});



app.get('/get-comments22', async (req, res) => {
  const { postid } = req.query;
  try {
    const result = await pool.query('SELECT * FROM comments22 WHERE postid = $1 ORDER BY timestamp ASC', [postid]);
    res.status(200).json({ success: true, comments: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});



app.put('/edit-post22', async (req, res) => {
  const { id, description } = req.body;
  
  try {
    const result = await pool.query(
      'UPDATE posts22 SET description = $2, updated_at = $3 WHERE id = $1 RETURNING *',
      [id, description, new Date()]
    );
    res.status(200).json({ success: true, post: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/create-assignment', upload.array('files', 10), async (req, res) => {
  const { title, description, due_date ,passwordgroup } = req.body;
  const files = req.files;
  const client = await pool.connect();
  try {

      const filesJson = files.map(file => ({
        filename: file.filename,
        mimetype: file.mimetype,
        path: file.path
      }));

      const assignmentResult = await client.query(
        'INSERT INTO assignments (title, description, due_date, files, created_at, passwordgroup) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [title, description, due_date ? new Date(due_date) : null, JSON.stringify(filesJson), new Date(),passwordgroup]
      );

      
      res.status(200).json({ success: true, assignment: assignmentResult.rows[0] });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
    console.log(error)
  }
});





app.get('/get-assignments', async (req, res) => {
  const { passwordgroup } = req.query;

  try {
    
    const assignmentsResult = await pool.query(
      'SELECT * FROM assignments WHERE passwordgroup = $1 ORDER BY created_at DESC',
      [passwordgroup]
    );
    res.status(200).json({ success: true, assignments: assignmentsResult.rows });
  
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});























































app.get('/timetable', async (req, res) => {
  const email = req.query.email;
  try {
    const result = await pool.query('SELECT * FROM timetable WHERE email = $1', [email]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching timetable:', err.message);
    res.status(500).send(err.message);
  }
});

app.post('/timetable', async (req, res) => {
  const { email, subject, day, start_time, end_time, subjectcode, sec, room } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO timetable (email, subject, day, start_time, end_time, subjectcode, sec, room) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [email, subject, day, start_time, end_time, subjectcode, sec, room]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error adding timetable:', err.message);
    res.status(500).send(err.message);
  }
});

app.delete('/timetable/:id', async (req, res) => {
  const { id } = req.params;
  const email = req.query.email;
  try {
    await pool.query('DELETE FROM timetable WHERE id = $1 AND email = $2', [id, email]);
    res.status(200).send('Deleted successfully');
  } catch (err) {
    console.error('Error deleting timetable:', err.message);
    res.status(500).send(err.message);
  }
});















app.post('/check-in', async (req, res) => {
  const { email, groupName } = req.body;

  try {
    const groupResult = await pool.query(
      'SELECT * FROM groups WHERE groupname = $1',
      [groupName]
    );

    if (groupResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Group not found.' });
    }

    
    await pool.query(
      'INSERT INTO checkins (email, groupname, checked_in_at) VALUES ($1, $2, NOW())',
      [email, groupName]
    );

    res.json({ success: true, message: 'Checked in successfully!' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error checking in.' });
  }
});








































app.post('/upload', upload.array('files', 10), async (req, res) => {
  const { email, assignmentId, message } = req.body;
  const files = req.files;

  try {
    
    const assignmentQuery = `
      SELECT passwordgroup 
      FROM assignments 
      WHERE id = $1
    `;
    const assignmentResult = await pool.query(assignmentQuery, [assignmentId]);

    if (assignmentResult.rowCount === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const { passwordgroup: assignmentPasswordgroup } = assignmentResult.rows[0];

    
    const groupQuery = `
      SELECT groupname, email_member 
      FROM groups 
      WHERE email_member = $1 AND passwordgroup = $2
    `;
    const groupResult = await pool.query(groupQuery, [email, assignmentPasswordgroup]);

    if (groupResult.rowCount === 0) {
      return res.status(404).json({ error: 'Group not found for user or passwordgroup mismatch' });
    }

    const { groupname, email_member } = groupResult.rows[0];

    
    const filesJson = files.map(file => ({
      filename: file.filename,
      mimetype: file.mimetype,
      path: file.path
    }));

    const submission_date = new Date();

    
    const homeworkQuery = `
      INSERT INTO homework (email_member, groupname, files, submission_date, passwordgroup, id_assignment, message)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `;

    const result = await pool.query(homeworkQuery, [
      email_member,
      groupname,
      JSON.stringify(filesJson),
      submission_date,
      assignmentPasswordgroup,  
      assignmentId,
      message,
    ]);

    res.status(200).json({ message: 'Files and message uploaded successfully', homework: result.rows[0] });
  } catch (error) {
    console.error('Error uploading files:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});







app.delete('/unsubmit', async (req, res) => {
  const { id_assignment, email_member } = req.body;

  if (!id_assignment || !email_member) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
   
    const result = await pool.query(
      `DELETE FROM homework
       WHERE id_assignment = $1 AND email_member = $2`,
      [id_assignment, email_member]
    );

    if (result.rowCount > 0) {
      res.status(200).json({ message: 'Unsubmission successful' });
    } else {
      res.status(404).json({ error: 'No matching record found' });
    }
  } catch (error) {
    console.error('Error handling unsubmission:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});












app.get('/get-homework/:assignmentId', async (req, res) => {
  const { assignmentId } = req.params;

  try {
    const homeworkQuery = `
      SELECT email_member, passwordgroup, files, message, submission_date 
      FROM homework 
      WHERE id_assignment = $1
    `;
    const homeworkResult = await pool.query(homeworkQuery, [assignmentId]);

    if (homeworkResult.rowCount === 0) {
      return res.status(404).json({ error: 'No homework found for this assignment' });
    }

    console.log('Homework Data:', homeworkResult.rows);

    const homeworkData = homeworkResult.rows.map(row => ({
      email_member: row.email_member,
      passwordgroup: row.passwordgroup,
      files: row.files,  
      message: row.message,
      submission_date: row.submission_date,
    }));

    res.status(200).json({ homework: homeworkData });
  } catch (error) {
    console.error('Error fetching homework:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});





app.get('/check-submission', async (req, res) => {
  const { id_assignment, email_member } = req.query;

  try {
    const result = await pool.query(
      'SELECT * FROM homework WHERE id_assignment = $1 AND email_member = $2',
      [id_assignment, email_member]
    );

    if (result.rows.length > 0) {
      const submission = result.rows[0];
   
      const hasFiles = submission.files && submission.files.length > 0;
      const hasMessage = submission.message && submission.message.trim() !== '';

      res.status(200).json({
        ...submission,
        hasFiles,
        hasMessage
      });
    } else {
      res.status(404).json({ message: 'No submission found' });
    }
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});




app.post('/update-score', async (req, res) => {
  const { email_member, score, passwordgroup ,id_assignment} = req.body;
  
  console.log('Request Body:', req.body);

  try {
    const result = await pool.query(
      'UPDATE homework SET score = $1 WHERE email_member = $2 AND passwordgroup = $3 AND id_assignment = $4',
      [score, email_member, passwordgroup, id_assignment]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'No matching record found' });
    }

    res.status(200).json({ message: 'Score updated successfully' });
  } catch (error) {
    console.error('Error updating score:', error);
    res.status(500).json({ error: 'Failed to update score' });
  }
});





app.post('/update-max-score', async (req, res) => {
  const { id_assignment, maxScore } = req.body;

  try {
    
    await pool.query(
      'UPDATE homework SET max_score = $1 WHERE id_assignment = $2',
      [maxScore, id_assignment]
    );
    res.status(200).send({ message: 'Max score updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: 'Failed to update max score' });
  }
});




app.get('/get-max-score/:id_assignment', async (req, res) => {
  const { id_assignment } = req.params;

  try {
    const result = await pool.query(
      'SELECT max_score FROM homework WHERE id_assignment = $1',
      [id_assignment]
    );

    if (result.rows.length > 0) {
      res.status(200).json({ maxScore: result.rows[0].max_score });
    } else {
      res.status(404).json({ message: 'Assignment not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to fetch max score' });
  }
});















app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
