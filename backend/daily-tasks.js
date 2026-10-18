const { randomUUID } = require('node:crypto');

function localDay(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function normalizeTask(body) {
  const title = String(body.title || '').trim();
  const dueDate = body.dueDate || localDay();
  const priority = body.priority || 'medium';
  const repeat = body.repeat || 'once';
  const reminder = body.reminder || '';
  if (!title || title.length > 100 || !validDate(dueDate) || !['high', 'medium', 'low'].includes(priority) || !['once', 'daily'].includes(repeat) || (reminder && !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminder))) {
    const error = new Error('请填写有效的任务名称、日期、优先级和提醒时间');
    error.statusCode = 400;
    throw error;
  }
  return { title, description: String(body.description || '').slice(0, 500), dueDate, priority, repeat, reminder, tag: String(body.tag || '').trim().slice(0, 30) };
}

async function initTaskTables(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS daily_tasks (
    id VARCHAR(64) NOT NULL, user_id INT UNSIGNED NOT NULL, title VARCHAR(100) NOT NULL,
    description VARCHAR(500) NOT NULL DEFAULT '', due_date VARCHAR(10) NOT NULL,
    priority VARCHAR(10) NOT NULL DEFAULT 'medium', repeat_type VARCHAR(10) NOT NULL DEFAULT 'once',
    reminder VARCHAR(5) NOT NULL DEFAULT '', tag VARCHAR(30) NOT NULL DEFAULT '', created_at BIGINT NOT NULL,
    PRIMARY KEY (id, user_id), INDEX idx_task_user_date (user_id, due_date)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS daily_task_states (
    id VARCHAR(64) NOT NULL, user_id INT UNSIGNED NOT NULL, task_id VARCHAR(64) NOT NULL,
    task_date VARCHAR(10) NOT NULL, status VARCHAR(10) NOT NULL DEFAULT 'pending',
    PRIMARY KEY (id, user_id), UNIQUE KEY idx_task_state (task_id, task_date, user_id)
  )`);
}

function installTaskRoutes(app, pool) {
  const handler = work => async (req, res) => {
    try { await work(req, res); } catch (error) { res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : '任务服务暂不可用，请稍后重试' }); }
  };
  const serialize = row => ({ id: row.id, title: row.title, description: row.description, dueDate: row.due_date, priority: row.priority, repeat: row.repeat_type, reminder: row.reminder, tag: row.tag, createdAt: Number(row.created_at) });
  app.get('/api/daily-tasks', handler(async (req, res) => {
    const date = req.query.date || localDay();
    if (!validDate(date)) return res.status(400).json({ error: '日期无效' });
    const [rows] = await pool.query('SELECT * FROM daily_tasks ORDER BY created_at DESC');
    const [states] = await pool.query('SELECT task_id, task_date, status FROM daily_task_states WHERE task_date <= ?', [date]);
    const stateMap = new Map(states.map(row => [`${row.task_id}:${row.task_date}`, row.status]));
    const active = day => rows.filter(row => row.due_date <= day && (row.repeat_type === 'daily' || row.due_date === day));
    const tasks = active(date).map(row => ({ ...serialize(row), status: stateMap.get(`${row.id}:${date}`) || 'pending' }));
    const history = [];
    for (let offset = 6; offset >= 0; offset--) {
      const day = new Date(`${date}T00:00:00Z`); day.setUTCDate(day.getUTCDate() - offset);
      const key = day.toISOString().slice(0, 10);
      const items = active(key).filter(row => stateMap.get(`${row.id}:${key}`) !== 'skipped');
      history.push({ date: key, total: items.length, done: items.filter(row => stateMap.get(`${row.id}:${key}`) === 'done').length });
    }
    let streak = 0;
    const cursor = new Date(`${date}T00:00:00Z`);
    for (let offset = 0; offset < 3660; offset++) {
      const key = cursor.toISOString().slice(0, 10);
      const completed = active(key).some(row => stateMap.get(`${row.id}:${key}`) === 'done');
      if (!completed && offset !== 0) break;
      if (completed) streak++;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    const upcoming = rows
      .filter(row => row.due_date > date)
      .sort((first, second) => first.due_date.localeCompare(second.due_date))
      .slice(0, 12)
      .map(row => ({ ...serialize(row), status: stateMap.get(`${row.id}:${date}`) || 'pending', upcoming: true }));
    res.json({ date, tasks, history, streak, upcoming });
  }));
  app.post('/api/daily-tasks', handler(async (req, res) => {
    const task = normalizeTask(req.body); const id = randomUUID(); const createdAt = Date.now();
    await pool.execute('INSERT INTO daily_tasks (id, title, description, due_date, priority, repeat_type, reminder, tag, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, task.title, task.description, task.dueDate, task.priority, task.repeat, task.reminder, task.tag, createdAt]);
    res.status(201).json({ ...task, id, createdAt, status: 'pending' });
  }));
  app.put('/api/daily-tasks/:id', handler(async (req, res) => {
    const task = normalizeTask(req.body);
    const [result] = await pool.execute('UPDATE daily_tasks SET title = ?, description = ?, due_date = ?, priority = ?, repeat_type = ?, reminder = ?, tag = ? WHERE id = ?', [task.title, task.description, task.dueDate, task.priority, task.repeat, task.reminder, task.tag, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: '任务不存在' });
    res.json({ ok: true });
  }));
  app.put('/api/daily-tasks/:id/state', handler(async (req, res) => {
    const { date, status } = req.body;
    if (!validDate(date) || !['pending', 'done', 'skipped'].includes(status)) return res.status(400).json({ error: '状态或日期无效' });
    const [tasks] = await pool.query('SELECT * FROM daily_tasks WHERE id = ?', [req.params.id]);
    const task = tasks[0];
    if (!task || task.due_date > date || (task.repeat_type !== 'daily' && task.due_date !== date)) return res.status(404).json({ error: '该日期的任务不存在' });
    await pool.execute('INSERT INTO daily_task_states (id, task_id, task_date, status) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status)', [randomUUID(), task.id, date, status]);
    res.json({ ok: true });
  }));
  app.delete('/api/daily-tasks/:id', handler(async (req, res) => {
    await pool.execute('DELETE FROM daily_task_states WHERE task_id = ?', [req.params.id]);
    const [result] = await pool.execute('DELETE FROM daily_tasks WHERE id = ?', [req.params.id]);
    res.status(result.affectedRows ? 200 : 404).json(result.affectedRows ? { ok: true } : { error: '任务不存在' });
  }));
}

module.exports = { initTaskTables, installTaskRoutes, normalizeTask, validDate, localDay };
