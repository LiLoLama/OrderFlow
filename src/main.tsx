import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import ErrorBoundary from './shared/ErrorBoundary';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element missing');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
