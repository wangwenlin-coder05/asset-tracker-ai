function databaseConfig() {
  if (!process.env.DB_PASSWORD) throw new Error('请配置 DB_PASSWORD，禁止使用硬编码数据库密码');
  if (process.env.NODE_ENV === 'production' && process.env.DB_USER === 'root') throw new Error('生产环境禁止使用 root 数据库账号');
  return {
    host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'stock_app', password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'stock_calculator', waitForConnections: true,
    connectionLimit: 10, queueLimit: 0, dateStrings: true, timezone: '+08:00',
    multipleStatements: false,
    ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}),
  };
}

module.exports = { databaseConfig };
