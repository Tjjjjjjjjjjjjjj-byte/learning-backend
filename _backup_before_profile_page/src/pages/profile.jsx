import { useNavigate } from "react-router-dom";
import "../styling/profile.css";

function Profile() {
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      const response = await fetch("http://localhost:3000/logout", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Logout failed");
      }

      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }

  return (
    <div className="profile-page">
      <button onClick={handleLogout}>Log Out</button>
    </div>
  );
}

export default Profile;