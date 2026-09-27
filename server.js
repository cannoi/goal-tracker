const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'goal-tracker.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to SQLite database.');
    db.run('PRAGMA foreign_keys = ON;');
    initDb();
  }
});

function initDb() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        category_id INTEGER,
        target_date TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS milestones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        position INTEGER DEFAULT 0,
        completed BOOLEAN DEFAULT 0,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
      );
    `);

    const defaultCategories = [
      ['Health & Fitness', '#10b981'],
      ['Career & Work', '#3b82f6'],
      ['Finance', '#8b5cf6'],
      ['Education & Growth', '#f59e0b'],
      ['Personal', '#ec4899']
    ];

    defaultCategories.forEach(([name, color]) => {
      db.run(`INSERT OR IGNORE INTO categories (name, color) VALUES (?, ?)`, [name, color]);
    });
  });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  db.get('SELECT 1 as ok', (err, row) => {
    if (err || !row) {
      res.status(500).json({ error: 'DB_UNHEALTHY', message: 'Database connection failed' });
    } else {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    }
  });
});

app.get('/api/categories', (req, res) => {
  db.all('SELECT * FROM categories ORDER BY name ASC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'DB_ERROR', message: err.message });
    }
    res.json(rows);
  });
});

app.post('/api/categories', (req, res) => {
  const { name, color } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Category name is required' });
  }
  const catColor = color || '#3b82f6';
  db.run('INSERT INTO categories (name, color) VALUES (?, ?)', [name.trim(), catColor], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ error: 'DUPLICATE', message: 'Category already exists' });
      }
      return res.status(500).json({ error: 'DB_ERROR', message: err.message });
    }
    res.status(201).json({ id: this.lastID, name: name.trim(), color: catColor });
  });
});

app.get('/api/goals', (req, res) => {
  const { status, category_id } = req.query;
  let query = `
    SELECT g.*, c.name as category_name, c.color as category_color,
      (SELECT COUNT(*) FROM milestones m WHERE m.goal_id = g.id) as total_milestones,
      (SELECT COUNT(*) FROM milestones m WHERE m.goal_id = g.id AND m.completed = 1) as completed_milestones
    FROM goals g
    LEFT JOIN categories c ON g.category_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    query += ' AND g.status = ?';
    params.push(status);
  }
  if (category_id) {
    query += ' AND g.category_id = ?';
    params.push(category_id);
  }

  query += ' ORDER BY g.created_at DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'DB_ERROR', message: err.message });
    }
    const goals = rows.map(goal => {
      const total = goal.total_milestones || 0;
      const completed = goal.completed_milestones || 0;
      const progress = total > 0 ? Math.round((completed / total) * 100) : (goal.status === 'completed' ? 100 : 0);
      return {
        ...goal,
        progress,
        completed_milestones: completed,
        total_milestones: total
      };
    });
    res.json(goals);
  });
});

app.post('/api/goals', (req, res) => {
  const { title, description, category_id, target_date } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Goal title is required' });
  }

  const stmt = db.prepare(`
    INSERT INTO goals (title, description, category_id, target_date, status, updated_at)
    VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
  `);

  stmt.run([title.trim(), description || '', category_id || null, target_date || null], function(err) {
    if (err) {
      return res.status(500).json({ error: 'DB_ERROR', message: err.message });
    }
    const newGoalId = this.lastID;
    db.get('SELECT g.*, c.name as category_name, c.color as category_color FROM goals g LEFT JOIN categories c ON g.category_id = c.id WHERE g.id = ?', [newGoalId], (err, row) => {
      if (err) {
        return res.status(201).json({ id: newGoalId, title: title.trim() });
      }
      res.status(201).json({ ...row, progress: 0, completed_milestones: 0, total_milestones: 0 });
    });
  });
  stmt.finalize();
});

app.get('/api/goals/:id', (req, res) => {
  const goalId = req.params.id;
  db.get(`
    SELECT g.*, c.name as category_name, c.color as category_color
    FROM goals g
    LEFT JOIN categories c ON g.category_id = c.id
    WHERE g.id = ?
  `, [goalId], (err, goal) => {
    if (err) {
      return res.status(500).json({ error: 'DB_ERROR', message: err.message });
    }
    if (!goal) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Goal not found' });
    }

    db.all('SELECT * FROM milestones WHERE goal_id = ? ORDER BY position ASC, id ASC', [goalId], (err, milestones) => {
      if (err) {
        return res.status(500).json({ error: 'DB_ERROR', message: err.message });
      }

      const total = milestones.length;
      const completed = milestones.filter(m => m.completed).length;
      const progress = total > 0 ? Math.round((completed / total) * 100) : (goal.status === 'completed' ? 100 : 0);

      res.json({
        ...goal,
        progress,
        completed_milestones: completed,
        total_milestones: total,
        milestones
      });
    });
  });
});

app.patch('/api/goals/:id', (req, res) => {
  const goalId = req.params.id;
  const { title, description, category_id, target_date, status } = req.body;

  db.get('SELECT * FROM goals WHERE id = ?', [goalId], (err, goal) => {
    if (err) return res.status(500).json({ error: 'DB_ERROR', message: err.message });
    if (!goal) return res.status(404).json({ error: 'NOT_FOUND', message: 'Goal not found' });

    const newTitle = title !== undefined ? title.trim() : goal.title;
    const newDesc = description !== undefined ? description : goal.description;
    const newCat = category_id !== undefined ? category_id : goal.category_id;
    const newDate = target_date !== undefined ? target_date : goal.target_date;
    const newStatus = status !== undefined ? status : goal.status;

    if (!newTitle) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Goal title cannot be empty' });
    }

    db.run(`
      UPDATE goals 
      SET title = ?, description = ?, category_id = ?, target_date = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [newTitle, newDesc, newCat, newDate, newStatus, goalId], function(err) {
      if (err) return res.status(500).json({ error: 'DB_ERROR', message: err.message });
      res.json({ success: true, id: goalId });
    });
  });
});

app.delete('/api/goals/:id', (req, res) => {
  const goalId = req.params.id;
  db.run('DELETE FROM goals WHERE id = ?', [goalId], function(err) {
    if (err) return res.status(500).json({ error: 'DB_ERROR', message: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Goal not found' });
    res.json({ success: true });
  });
});

app.post('/api/goals/:id/milestones', (req, res) => {
  const goalId = req.params.id;
  const { title } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Milestone title is required' });
  }

  db.get('SELECT COUNT(*) as cnt FROM milestones WHERE goal_id = ?', [goalId], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB_ERROR', message: err.message });
    const position = row ? row.cnt : 0;

    db.run('INSERT INTO milestones (goal_id, title, position, completed) VALUES (?, ?, ?, 0)', [goalId, title.trim(), position], function(err) {
      if (err) return res.status(500).json({ error: 'DB_ERROR', message: err.message });
      res.status(201).json({
        id: this.lastID,
        goal_id: Number(goalId),
        title: title.trim(),
        position,
        completed: 0
      });
    });
  });
});

app.patch('/api/milestones/:id', (req, res) => {
  const milestoneId = req.params.id;
  const { title, completed } = req.body;

  db.get('SELECT * FROM milestones WHERE id = ?', [milestoneId], (err, m) => {
    if (err) return res.status(500).json({ error: 'DB_ERROR', message: err.message });
    if (!m) return res.status(404).json({ error: 'NOT_FOUND', message: 'Milestone not found' });

    const newTitle = title !== undefined ? title.trim() : m.title;
    const newCompleted = completed !== undefined ? (completed ? 1 : 0) : m.completed;
    const completedAt = newCompleted && !m.completed ? new Date().toISOString() : (!newCompleted ? null : m.completed_at);

    db.run('UPDATE milestones SET title = ?, completed = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newTitle, newCompleted, completedAt, milestoneId], function(err) {
        if (err) return res.status(500).json({ error: 'DB_ERROR', message: err.message });
        res.json({ success: true, id: milestoneId, completed: newCompleted });
      }
    );
  });
});

app.delete('/api/milestones/:id', (req, res) => {
  const milestoneId = req.params.id;
  db.run('DELETE FROM milestones WHERE id = ?', [milestoneId], function(err) {
    if (err) return res.status(500).json({ error: 'DB_ERROR', message: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Milestone not found' });
    res.json({ success: true });
  });
});

app.get('/api/dashboard', (req, res) => {
  db.get(`
    SELECT 
      COUNT(*) as total_goals,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_goals,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_goals
    FROM goals
  `, [], (err, stats) => {
    if (err) return res.status(500).json({ error: 'DB_ERROR', message: err.message });

    db.get('SELECT COUNT(*) as total_milestones, SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed_milestones FROM milestones', [], (err, mStats) => {
      if (err) return res.status(500).json({ error: 'DB_ERROR', message: err.message });

      db.all(`
        SELECT g.*, c.name as category_name, c.color as category_color
        FROM goals g 
        LEFT JOIN categories c ON g.category_id = c.id 
        WHERE g.status = 'active'
        ORDER BY g.target_date ASC NULLS LAST, g.created_at DESC 
        LIMIT 5
      `, [], (err, upcoming) => {
        if (err) return res.status(500).json({ error: 'DB_ERROR', message: err.message });

        res.json({
          stats: {
            total_goals: stats.total_goals || 0,
            active_goals: stats.active_goals || 0,
            completed_goals: stats.completed_goals || 0,
            total_milestones: mStats.total_milestones || 0,
            completed_milestones: mStats.completed_milestones || 0
          },
          upcoming_goals: upcoming
        });
      });
    });
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Goal Tracker running on http://0.0.0.0:${PORT}`);
});
