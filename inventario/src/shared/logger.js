const log = (nivel) => (obj, msg) => {
  const base = typeof obj === 'string' ? { msg: obj } : { ...obj, msg };
  if (base.error instanceof Error) base.error = { name: base.error.name, message: base.error.message };
  console[nivel === 'error' ? 'error' : 'log'](JSON.stringify({ nivel, ts: new Date().toISOString(), ...base }));
};
export const logger = { info: log('info'), warn: log('warn'), error: log('error') };
