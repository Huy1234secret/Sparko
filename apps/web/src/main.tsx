import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import '../../../design-system/assets/icons/sp-icon.js';
import './styles.css';
import './site/site.css';
import { ToastProvider } from './ui';
import { createRouter } from './router';
import { createQueryClient } from './data';

const root = document.getElementById('root');
if (!root) throw new Error('The Sparko root element is missing.');
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <RouterProvider router={createRouter()} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
