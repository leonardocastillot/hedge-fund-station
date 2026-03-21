import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Note: StrictMode disabled because it causes double-mounting in dev,
// which conflicts with node-pty terminal lifecycle management
ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
);
