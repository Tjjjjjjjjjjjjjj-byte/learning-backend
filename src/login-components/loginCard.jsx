import { useState, useEffect } from "react"; // Added useEffect
import { Link, useNavigate } from "react-router-dom";

function LoginCard() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [failed, setFailed] = useState(false);
  const navigate = useNavigate();

  // 1. Run the login check instantly when the page loads
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

        if (response.status === 200) {
          navigate("/home", { replace: true }); // Instantly redirect to home
        }
      } catch (error) {
        console.error("Session check failed:", error);
      }
    }

    checkLogIn();
  }, [navigate]);

  const handleLogin = async () => {
    try {
      const response = await fetch("http://localhost:3000/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ identifier, password }),
      });

      if (response.status === 401) {
        setFailed(true);
      } else {
        setFailed(false);
        navigate("/home");
      }
    } catch (error) {
      console.error("Login error:", error);
    }
  };

  return (
    <div className="auth-page">
      <h1 className="greet">Welcome Back!</h1>
      <input
        className={failed ? "input-error" : "identifier"}
        type="text"
        placeholder="Enter Your Username/Email"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
      />
      {failed && <p className="error-message">Incorrect username or password</p>}

      <input
        type="password" // Changed to password type to hide characters
        placeholder="Enter your password"
        className={failed ? "input-error" : "password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {failed && <p className="error-message">Incorrect username or password</p>}

      <Link to="/forgotPasswordPage">Forgot Your Password?</Link>
      <Link to="/signUpPage">Don't have an account? Sign Up Now!</Link>
      <button className="sign-in-btn" onClick={handleLogin}>
        Sign In
      </button>
    </div>
  );
}

export default LoginCard;
