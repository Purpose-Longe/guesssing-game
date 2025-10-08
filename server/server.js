const { createApp } = require('./app');
const { ensureSchema } = require('./schema');

const PORT = process.env.PORT || 4000;

ensureSchema()
  .then(() => {
    const app = createApp();
    app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to initialize schema', err);
    process.exit(1);
  });
