"use client";

import { useEffect, useState } from "react";

export default function DevServerLink() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(window.self === window.top && window.location.hostname === "127.0.0.1");
  }, []);
  if (!visible) return null;
  return (
    <a href="http://127.0.0.1:3301/" style={{
      position: "fixed", right: 12, bottom: 12, zIndex: 100,
      background: "#101311", color: "#6af5db", border: "1px solid #526158",
      padding: "9px 13px", fontSize: 12, textDecoration: "none",
    }}>開発用サーバー ON / OFF</a>
  );
}
