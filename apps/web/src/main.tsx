import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import '../../../design-system/assets/icons/sp-icon.js';
import './styles.css';
import './site/site.css';
import { ToastProvider } from './ui';
import { createRouter } from './router';

const root = document.getElementById('root');
if (!root) throw new Error('The Sparko root element is missing.');
createRoot(root).render(
  <StrictMode>
    <ToastProvider>
      <RouterProvider router={createRouter()} />
    </ToastProvider>
  </StrictMode>,
);
