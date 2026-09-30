import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Nav from "../home-components/nav";
import ListeningStats from "../profile-components/ListeningStats";
import PrivacySettings from "../profile-components/PrivacySettings";
import { getCurrentUser } from "../services/profileApi";
import "../styling/profile.css";

function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      try {
        const current = await getCurrentUser();
        if (!cancelled) setUser(current);
      } catch (error) {
        if (error.status === 401) {
          navigate("/login", { replace: true });
        } else {
          console.error("Failed to load profile:", error);
        }
      }
    }

    loadUser();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const username = user?.username || "";

  return (
    <>
      <Nav />

      <main className="profile-page">
        <div className="profile-card">
          <header className="profile-header">
            <div className="profile-avatar" aria-hidden="true">
              {username ? username.charAt(0).toUpperCase() : ""}
            </div>

            <div className="profile-header-text">
              <span className="profile-kicker">Profile</span>
              <h1>{username || "\u00A0"}</h1>
            </div>
          </header>

          <ListeningStats />
          <PrivacySettings />
        </div>
      </main>
    </>
  );
}

export default Profile;
