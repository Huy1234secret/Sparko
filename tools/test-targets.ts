export function testDatabaseUrl() {
  const value = process.env['TEST_DATABASE_URL'];
  if (!value)
    throw new Error(
      'Set TEST_DATABASE_URL explicitly. Production DATABASE_URL is never used by tests.',
    );
  const url = new URL(value);
  if (
    !['localhost', '127.0.0.1', 'postgres'].includes(url.hostname) ||
    !/^\/sparko_[a-z0-9_]*test$/.test(url.pathname)
  )
    throw new Error(
      'TEST_DATABASE_URL must be a disposable local sparko_*test database.',
    );
  return value;
}
export function testRedisUrl() {
  const value = process.env['TEST_REDIS_URL'];
  if (!value) throw new Error('Set TEST_REDIS_URL explicitly.');
  const url = new URL(value);
  if (
    !['localhost', '127.0.0.1', 'redis'].includes(url.hostname) ||
    url.pathname !== '/15'
  )
    throw new Error('TEST_REDIS_URL must use local reserved database /15.');
  return value;
}
