export default () => ({
  enableTrading: process.env.ENABLE_TRADING === 'true',
  enablePoolManager: process.env.ENABLE_POOL_MANAGER === 'true',
});
