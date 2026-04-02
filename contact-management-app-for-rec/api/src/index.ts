import { config } from './config';
import { createApp } from './app';

const app = createApp();

app.listen(config.port, () => {
  console.log(`API server running on port ${config.port} (${config.nodeEnv})`);
});
