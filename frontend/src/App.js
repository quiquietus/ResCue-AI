import React from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./Components/Home";
import NgoPortal from "./Components/Ngo";
import DisasterMap from "./Components/UserForm";
import Navbar from "./Components/Navbar";
import "./App.css";

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/ngo" element={<NgoPortal />} />
        <Route path="/help" element={<DisasterMap />} />
      </Routes>
    </>
  );
}
