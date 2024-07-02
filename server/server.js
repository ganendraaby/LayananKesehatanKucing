const express = require('express');
const app = express();
const mysql = require('mysql');
const cors = require('cors');

app.use(cors());
app.use(express.json());

// Membuat koneksi ke database
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'layanan_kesehatan_kucing'
});

// Menghubungkan ke database
db.connect(err => {
  if (err) {
    console.error('Database connection failed:', err.stack);
    return;
  }
  console.log('Connected to database.');
});

app.get('/api', (req, res) => {
  res.json({ "users": ["userOne", "userTwo", "userThree", "userFour"] });
});

// Endpoint to create a new appointment
app.post('/api/appointments', (req, res) => {
  const { id_jd, cats, status } = req.body;
  
  if (!id_jd || !cats || !status) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.beginTransaction(err => {
    if (err) {
      return res.status(500).json({ error: 'Failed to start transaction' });
    }

    const createAppointmentQuery = 'INSERT INTO janji_temu (id_jd, status) VALUES (?, ?)';
    db.query(createAppointmentQuery, [id_jd, status], (err, result) => {
      if (err) {
        return db.rollback(() => {
          res.status(500).json({ error: 'Failed to create appointment' });
        });
      }

      const appointmentId = result.insertId;
      const createCatAppointmentsQuery = 'INSERT INTO janji_temu_kucing (id_jt, id_k) VALUES ?';
      const catAppointmentsData = cats.map(catId => [appointmentId, catId]);

      db.query(createCatAppointmentsQuery, [catAppointmentsData], (err) => {
        if (err) {
          return db.rollback(() => {
            res.status(500).json({ error: 'Failed to create cat appointments' });
          });
        }

        db.commit(err => {
          if (err) {
            return db.rollback(() => {
              res.status(500).json({ error: 'Failed to commit transaction' });
            });
          }

          res.status(201).json({ message: 'Appointment created successfully', appointmentId });
        });
      });
    });
  });
});

// API endpoint to fetch appointment history
app.get("/api/appointments", (req, res) => {
  const sql = `
    SELECT 
      jt.id_jt,
      jd.tanggal,
      jd.waktu,
      d.nama_d,
      jt.status
    FROM
      janji_temu jt
      JOIN jadwal_dokter jd ON jt.id_jd = jd.id_jd
      JOIN dokter d ON jd.id_d = d.id_d
    ORDER BY jd.tanggal, jd.waktu;
  `;
  
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching appointments:', err);
      res.status(500).json({ error: 'Failed to fetch appointments' });
      return;
    }
    res.json(results);
  });
});

app.put('/api/appointments/:id', (req, res) => {
  const appointmentId = req.params.id;
  const newStatus = req.body.status;

  db.query('UPDATE janji_temu SET status = ? WHERE id_jt = ?', [newStatus, appointmentId], (err, result) => {
    if (err) {
      console.error('Error updating appointment status:', err);
      res.status(500).send('Internal server error');
      return;
    }
    res.sendStatus(200);
  });
});

// Endpoint to delete an appointment
app.delete('/api/appointments/:id_jt', (req, res) => {
  const { id_jt } = req.params;

  // First, delete related entries in janji_temu_kucing
  const deleteCatAppointmentsQuery = 'DELETE FROM janji_temu_kucing WHERE id_jt = ?';
  db.query(deleteCatAppointmentsQuery, [id_jt], (err) => {
    if (err) {
      console.error('Error deleting cat appointments:', err);
      return res.status(500).json({ error: 'Failed to delete cat appointments' });
    }

    // Then, delete the appointment itself
    const deleteAppointmentQuery = 'DELETE FROM janji_temu WHERE id_jt = ?';
    db.query(deleteAppointmentQuery, [id_jt], (err) => {
      if (err) {
        console.error('Error deleting appointment:', err);
        return res.status(500).json({ error: 'Failed to delete appointment' });
      }

      res.status(200).json({ message: 'Appointment deleted successfully' });
    });
  });
});

// Endpoint API untuk memperoleh data kucing
app.get('/api/cats', (req, res) => {
  const sql = `
    SELECT 
      id_k,
      nama_k,
      foto_kucing
    FROM
      kucing;
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching cats:', err);
      res.status(500).json({ error: 'Failed to fetch cats' });
      return;
    }
    // Mengubah data gambar binary ke base64
    results.forEach(cat => {
      cat.foto_kucing = Buffer.from(cat.foto_kucing).toString('base64');
    });
    res.json(results);
  });
});

app.get('/api/cats/:id', (req, res) => {
  const catId = req.params.id;
  db.query('SELECT * FROM kucing WHERE id_k = ?', [catId], (err, results) => {
    if (err) {
      console.error('Error fetching cat:', err);
      res.status(500).send('Internal server error');
      return;
    }
    res.json(results[0]);
  });
});

// Endpoint API untuk memperoleh data dokter hewan
app.get('/api/veterinarians', (req, res) => {
  db.query('SELECT * FROM dokter', (err, results) => {
    if (err) {
      console.error('Error fetching veterinarians:', err);
      res.status(500).send('Internal server error');
      return;
    }
    res.json(results);
  });
});

app.get('/api/veterinarians/:id', (req, res) => {
  const vetId = req.params.id;
  console.log(`Fetching veterinarian with ID: ${vetId}`);
  db.query('SELECT * FROM dokter WHERE id_d = ?', [vetId], (err, results) => {
    if (err) {
      console.error('Error fetching veterinarian:', err);
      res.status(500).send('Internal server error');
      return;
    }
    res.json(results[0]);
  });
});

app.get('/api/veterinarians/:id/schedules', (req, res) => {
  const vetId = req.params.id;
  console.log(`Fetching schedules for veterinarian with ID: ${vetId}`);
  db.query('SELECT * FROM jadwal_dokter WHERE id_d = ?', [vetId], (err, results) => {
    if (err) {
      console.error('Error fetching schedules:', err);
      res.status(500).send('Internal server error');
      return;
    }
    res.json(results);
  });
});

app.get('/api/schedules/:id', (req, res) => {
  const scheduleId = req.params.id;
  db.query('SELECT * FROM jadwal_dokter WHERE id_jd = ?', [scheduleId], (err, results) => {
    if (err) {
      console.error('Error fetching schedule:', err);
      res.status(500).send('Internal server error');
      return;
    }
    res.json(results[0]);
  });
});

app.get('/api/veterinarians/:id_d/schedules/:id_j', (req, res) => {
  const { id_d, id_j } = req.params;

  const query = 'SELECT * FROM jadwal_dokter WHERE id_d = ? AND id_jd = ?';
  db.query(query, [id_d, id_j], (err, results) => {
    if (err) {
      console.error('Error fetching schedule:', err);
      return res.status(500).json({ error: 'Failed to fetch schedule' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    res.json(results[0]);
  });
});

app.listen(5000, () => { console.log("Server started on port 5000") });
