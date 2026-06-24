import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Landing from './pages/Landing.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Send from './pages/Send.jsx';
import Receive from './pages/Receive.jsx';
import RouterPage from './pages/Router.jsx';
import Fraud from './pages/Fraud.jsx';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="send" element={<Send />} />
          <Route path="receive" element={<Receive />} />
          <Route path="router" element={<RouterPage />} />
          <Route path="fraud" element={<Fraud />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
