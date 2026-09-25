import { useNavigate } from "react-router-dom";

function HomeBtn({ setSelectedPlaylist }) {
  const navigate = useNavigate();

  function handleHome() {
    if (setSelectedPlaylist) {
      setSelectedPlaylist(null);
    }

    navigate("/home");
  }

  return (
    <button className="homeBtn" onClick={handleHome}>
      <span className="material-symbols-outlined">home</span>
    </button>
  );
}

export default HomeBtn;