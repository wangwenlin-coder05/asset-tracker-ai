const { AsyncLocalStorage } = require('node:async_hooks');
const context = new AsyncLocalStorage();

function currentUser() {
  const user = context.getStore()?.user;
  if (!user) throw new Error('TENANT_CONTEXT_REQUIRED');
  return user;
}

module.exports = { context, currentUser };
