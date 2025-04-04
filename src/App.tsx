import React from 'react';
import NearbyBites from './components/NearbyBites';

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-teal-500" />
      <NearbyBites />
    </div>
  );
}
