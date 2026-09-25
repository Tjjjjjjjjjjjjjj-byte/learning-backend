import { useNavigate } from "react-router-dom";

function ProfileIcon({ iconUrl }) {
  const navigate = useNavigate();

  return (
    <button className="profileBtn" onClick={() => navigate("/profile")}>
      <img
        src={
          iconUrl ||
          "https://ui-avatars.com/api/?name=User&background=random"
        }
        alt="Profile"
      />
    </button>
  );
}

export default ProfileIcon;