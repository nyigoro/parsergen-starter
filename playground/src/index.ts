import './style.css';
import './main.lm';
import { startPlayground } from './playground-controller';

void startPlayground().catch((error) => {
  const status = document.getElementById('status-compile');
  if (status) status.textContent = 'error';
  queueMicrotask(() => {
    throw error;
  });
});
