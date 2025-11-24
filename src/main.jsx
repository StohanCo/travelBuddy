import React from 'react'
import ReactDOM from 'react-dom/client'
import TravelApp from './TravelPlanner.jsx'
import './index.css' // Optional if you have custom CSS

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <TravelApp />
  </React.StrictMode>,
)