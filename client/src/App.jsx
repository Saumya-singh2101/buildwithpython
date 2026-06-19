import React from "react";

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import HomePage from "./pages/HomePage";
import CommuterDashboard from "./pages/CommuterDashboard";
import CommuterDashboardPreview from "./pages/CommuterDashboardPreview";  // add this

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"          element={<HomePage />} />
        <Route path="/commuter"  element={<CommuterDashboard />} />
      
        <Route path="/preview" element={<CommuterDashboardPreview />} />
        <Route path="*"          element={<Navigate to="/" />} />

      </Routes>
    </BrowserRouter>
  );
}
