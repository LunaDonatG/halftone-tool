import React from 'react'
import ReactDOM from 'react-dom/client'
import { DialRoot } from 'dialkit'
import 'dialkit/styles.css'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DialRoot position="top-right" />
    <App />
  </React.StrictMode>
)
