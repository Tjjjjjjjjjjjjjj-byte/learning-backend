import { useState } from "react";
function Maximize({ maximized, setMaximized, minimized }) {

  return (
    !minimized && (
      <button
        className={maximized ? "maximize-btn" : "maximize-btn hidden"}
        onClick={() => setMaximized(!maximized)}
      >
        <span className="material-symbols-outlined">expand_content</span>
      </button>
    )
  );
}
export default Maximize;
