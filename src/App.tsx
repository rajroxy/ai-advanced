import { Navigate, Route, Routes } from "react-router-dom";
import Landing from "./views/Landing";
import Workspace from "./views/Workspace";
import Generate from "./views/Generate";
import Library from "./views/Library";
import Search from "./views/Search";
import Memory from "./views/Memory";
import Settings from "./views/Settings";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/app" element={<Workspace />}>
        <Route index element={<Generate />} />
        <Route path="library" element={<Library />} />
        <Route path="search" element={<Search />} />
        <Route path="memory" element={<Memory />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
