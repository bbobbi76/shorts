import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import LearnerApp, { RoleHome } from './LearnerApp';
import './styles.css';

const router = createBrowserRouter([{ path: '/', element: <RoleHome/> }, { path: '/admin/*', element: <App/> }, { path: '/learn/*', element: <LearnerApp/> }, { path: '*', element: <RoleHome/> }]);
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><RouterProvider router={router}/></React.StrictMode>);
