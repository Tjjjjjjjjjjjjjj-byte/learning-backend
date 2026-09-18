import Nav from "../home-components/nav";
import PlaylistSidebar from "../home-components/playlistsidebar";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
function home() {
  const navigate = useNavigate();

  useEffect(() => {
    async function checkLogIn() {
      try {
        const response = await fetch("http://localhost:3000/me", {
          method: "GET", // Changed to GET (standard for checking active sessions)
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (response.status !== 200) {
          navigate("/login", { replace: true }); // Instantly redirect to home
        }
      } catch (error) {
        console.error("Session check failed:", error);
      }
    }

    checkLogIn();
  }, [navigate]);
  return (
    <>
      <Nav />
      <PlaylistSidebar />
    </>
  );
}
export default home;
